import hmac
import secrets
import sqlite3
import time
from datetime import date, datetime
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
IMAGES = ROOT / "images"
UPLOADS = IMAGES / "uploads"
DB_PATH = DATA / "shop.db"
SECRET_PATH = DATA / "secret.key"

SHOP = {
    "name": "Поле",
    "city": "Москва",
    "phone": "+7 000 000-00-00",
    "phone_tel": "+70000000000",
    "address": "ул. Цветочная, 12",
    "hours": "ежедневно, 9:00–21:00",
}

DEMO_USER = "florist"
DEMO_PASSWORD = "pole-demo"
PROMO_CODE = "POLE10"

CATEGORIES = (
    ("bouquets", "Букеты"),
    ("roses", "Розы"),
    ("gifts", "Подарки"),
    ("plants", "Растения"),
)
CATEGORY_NAMES = dict(CATEGORIES)

ZONES = (
    ("pickup", "Самовывоз", 0),
    ("center", "Центр", 490),
    ("city", "Весь город", 790),
)
ZONE_NAMES = {key: title for key, title, _ in ZONES}
ZONE_PRICES = {key: price for key, _, price in ZONES}

SLOTS = (
    ("10:00–13:00", 0),
    ("13:00–16:00", 0),
    ("16:00–19:00", 0),
    ("19:00–21:00", 400),
)
SLOT_EXTRA = dict(SLOTS)

STATUSES = (
    ("new", "Новый"),
    ("making", "Собираем"),
    ("delivery", "В доставке"),
    ("done", "Доставлен"),
    ("cancelled", "Отменён"),
)
STATUS_NAMES = dict(STATUSES)

SEED = (
    ("Рассвет", "bouquets", 5400, "M", "Розы, эустома и эвкалипт. Свободная сборка, высота около 45 см.", "hero.jpg"),
    ("Персиковый сад", "bouquets", 6200, "M", "Пионовидные розы, светлая гвоздика и эвкалипт. Лента в тон букета.", "p6.jpg"),
    ("Красные розы", "roses", 5900, "15 шт.", "Пятнадцать красных роз одной длины. Классический букет без лишней зелени.", "p4.jpg"),
    ("Тюльпаны", "bouquets", 3900, "15 шт.", "Розовые тюльпаны, пятнадцать стеблей. Оттенок сезона может чуть отличаться.", "p1.jpg"),
    ("Подсолнухи", "bouquets", 4200, "M", "Крупные подсолнухи и зелень. Сезонный букет, пока цветок есть у поставщика.", "p3.jpg"),
    ("Радужные розы", "roses", 4800, "11 шт.", "Окрашенные розы. Яркий букет, если нужен не классический цвет.", "p7.jpg"),
    ("Сердце", "gifts", 4500, "S", "Композиция в форме сердца. Оттенки подбираем близко к фотографии.", "p2.jpg"),
    ("Хавортия в горшке", "plants", 1900, "S", "Небольшое растение в керамическом горшке. Живёт дольше срезанного букета.", "p9.jpg"),
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


def load_secret():
    DATA.mkdir(exist_ok=True)
    if SECRET_PATH.exists():
        return SECRET_PATH.read_text(encoding="utf-8").strip()
    secret = secrets.token_hex(32)
    SECRET_PATH.write_text(secret, encoding="utf-8")
    return secret


app.secret_key = load_secret()


def db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    DATA.mkdir(exist_ok=True)
    UPLOADS.mkdir(exist_ok=True)
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price INTEGER NOT NULL,
                size TEXT NOT NULL,
                description TEXT NOT NULL,
                image TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY,
                created_at TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                recipient TEXT NOT NULL,
                zone TEXT NOT NULL,
                address TEXT NOT NULL,
                delivery_date TEXT NOT NULL,
                slot TEXT NOT NULL,
                card_text TEXT NOT NULL,
                comment TEXT NOT NULL,
                goods_total INTEGER NOT NULL,
                discount INTEGER NOT NULL,
                delivery_price INTEGER NOT NULL,
                total INTEGER NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_name TEXT NOT NULL,
                qty INTEGER NOT NULL,
                price INTEGER NOT NULL
            );
            """
        )
        user = connection.execute("SELECT id FROM users LIMIT 1").fetchone()
        if user is None:
            connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (DEMO_USER, generate_password_hash(DEMO_PASSWORD)),
            )
        count = connection.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]
        if count == 0:
            now = datetime.now().isoformat(timespec="minutes")
            connection.executemany(
                """
                INSERT INTO products (name, category, price, size, description, image, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [(*item, now) for item in SEED],
            )


def rub(value):
    return f"{int(value):,}".replace(",", " ") + " ₽"


def category_name(key):
    return CATEGORY_NAMES.get(key, key)


def ensure_csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


def csrf_ok():
    sent = request.form.get("csrf", "")
    saved = session.get("csrf", "")
    return bool(saved) and bool(sent) and hmac.compare_digest(saved, sent)


def cart():
    raw = session.get("cart") or {}
    clean = {}
    for key, qty in raw.items():
        try:
            number = int(qty)
        except (TypeError, ValueError):
            continue
        if number > 0:
            clean[str(key)] = min(number, 20)
    return clean


def save_cart(items):
    session["cart"] = items
    session.modified = True


def cart_count():
    return sum(cart().values())


def cart_details(connection):
    lines = []
    current = cart()
    changed = False
    for key, qty in list(current.items()):
        product = connection.execute("SELECT * FROM products WHERE id = ?", (key,)).fetchone()
        if product is None:
            current.pop(key, None)
            changed = True
            continue
        lines.append({"product": product, "qty": qty, "sum": product["price"] * qty})
    if changed:
        save_cart(current)
    goods = sum(line["sum"] for line in lines)
    return lines, goods


def quote(goods, zone, slot, promo):
    discount = round(goods * 0.1) if promo else 0
    delivery = ZONE_PRICES.get(zone, 0) + SLOT_EXTRA.get(slot, 0)
    total = max(0, goods - discount + delivery)
    return {"goods": goods, "discount": discount, "delivery": delivery, "total": total}


def valid_phone(value):
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) == 10:
        return True
    return len(digits) == 11 and digits[0] in "78"


def parse_price(value):
    digits = str(value).replace(" ", "").replace("₽", "")
    if not digits.isdigit():
        return None
    number = int(digits)
    if 1 <= number <= 1_000_000:
        return number
    return None


def safe_image(name):
    if not name or "\\" in name or name.startswith("/"):
        return None
    path = (IMAGES / name).resolve()
    try:
        path.relative_to(IMAGES.resolve())
    except ValueError:
        return None
    if path.is_file():
        return path
    return None


def save_upload(file_storage):
    if file_storage is None or not file_storage.filename:
        return None
    original = secure_filename(file_storage.filename)
    suffix = Path(original).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Нужна фотография в формате JPG, PNG или WEBP.")
    data = file_storage.read()
    if len(data) > 5 * 1024 * 1024:
        raise ValueError("Фотография больше 5 МБ.")
    signatures = {
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
        ".png": (b"\x89PNG",),
        ".webp": (b"RIFF",),
    }
    if not data.startswith(signatures[suffix]):
        raise ValueError("Файл не похож на выбранный формат фотографии.")
    if suffix == ".webp" and data[8:12] != b"WEBP":
        raise ValueError("Файл не похож на WEBP.")
    filename = secrets.token_hex(8) + suffix
    (UPLOADS / filename).write_bytes(data)
    return "uploads/" + filename


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def redirect_back(fallback):
    ref = request.referrer or ""
    if ref.startswith(request.host_url):
        return redirect(ref)
    return redirect(fallback)


def require_csrf():
    if not csrf_ok():
        abort(400)


@app.context_processor
def template_context():
    return {
        "shop": SHOP,
        "csrf": ensure_csrf(),
        "cart_count": cart_count(),
        "categories": CATEGORIES,
        "category_name": category_name,
        "statuses": STATUSES,
        "status_name": STATUS_NAMES.get,
        "promo_code": PROMO_CODE,
        "zones": ZONES,
        "slots": SLOTS,
        "today": date.today().isoformat(),
    }


@app.template_filter("rub")
def rub_filter(value):
    return rub(value)


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; script-src 'self'; "
        "form-action 'self'; base-uri 'self'; frame-ancestors 'none'"
    )
    return response


@app.get("/media/<path:name>")
def media(name):
    path = safe_image(name)
    if path is None:
        abort(404)
    return send_from_directory(path.parent, path.name)


@app.get("/")
def home():
    category = request.args.get("category", "all")
    if category != "all" and category not in CATEGORY_NAMES:
        category = "all"
    query = request.args.get("q", "").strip()[:80]
    sql = "SELECT * FROM products"
    params = []
    where = []
    if category != "all":
        where.append("category = ?")
        params.append(category)
    if query:
        where.append("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')")
        needle = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        params.extend((needle, needle))
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id"
    with db() as connection:
        products = connection.execute(sql, params).fetchall()
        counts = {"all": connection.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]}
        for key, _title in CATEGORIES:
            counts[key] = connection.execute(
                "SELECT COUNT(*) AS n FROM products WHERE category = ?",
                (key,),
            ).fetchone()["n"]
    return render_template("index.html", products=products, category=category, query=query, counts=counts)


@app.get("/product/<int:product_id>")
def product(product_id):
    with db() as connection:
        item = connection.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if item is None:
        abort(404)
    return render_template("product.html", product=item)


@app.post("/cart/add")
def cart_add():
    require_csrf()
    product_id = request.form.get("product_id", "")
    try:
        qty = int(request.form.get("qty", "1"))
    except ValueError:
        qty = 1
    qty = min(max(qty, 1), 20)
    with db() as connection:
        item = connection.execute("SELECT id, name FROM products WHERE id = ?", (product_id,)).fetchone()
    if item is None:
        abort(404)
    current = cart()
    current[str(item["id"])] = min(20, current.get(str(item["id"]), 0) + qty)
    save_cart(current)
    flash("«" + item["name"] + "» в корзине.")
    return redirect_back(url_for("home"))


@app.post("/cart/qty")
def cart_qty():
    require_csrf()
    product_id = str(request.form.get("product_id", ""))
    try:
        qty = int(request.form.get("qty", "0"))
    except ValueError:
        qty = 0
    current = cart()
    if qty <= 0:
        current.pop(product_id, None)
    else:
        current[product_id] = min(qty, 20)
    save_cart(current)
    return redirect(url_for("cart_page"))


@app.get("/cart")
def cart_page():
    with db() as connection:
        lines, goods = cart_details(connection)
    preview = quote(goods, "center", "13:00–16:00", False)
    return render_template("cart.html", lines=lines, preview=preview, form={}, errors=[])


@app.post("/checkout")
def checkout():
    require_csrf()
    form = {
        "name": request.form.get("name", "").strip(),
        "phone": request.form.get("phone", "").strip(),
        "recipient": request.form.get("recipient", "").strip(),
        "zone": request.form.get("zone", "center"),
        "address": request.form.get("address", "").strip(),
        "delivery_date": request.form.get("delivery_date", ""),
        "slot": request.form.get("slot", "13:00–16:00"),
        "card_text": request.form.get("card_text", "").strip(),
        "comment": request.form.get("comment", "").strip(),
        "promo": request.form.get("promo", "").strip(),
    }
    errors = []
    if len(form["name"]) < 2 or len(form["name"]) > 80:
        errors.append("Напишите имя, чтобы флорист знал, кому перезвонить.")
    if not valid_phone(form["phone"]):
        errors.append("Телефон нужен в формате +7 и ещё десять цифр.")
    if form["zone"] not in ZONE_PRICES:
        errors.append("Выберите зону доставки.")
    if form["zone"] != "pickup" and len(form["address"]) < 8:
        errors.append("Для доставки нужен адрес: улица и дом.")
    if len(form["address"]) > 200:
        errors.append("Адрес слишком длинный.")
    try:
        chosen = datetime.strptime(form["delivery_date"], "%Y-%m-%d").date()
        if chosen < date.today():
            errors.append("Дата доставки уже прошла.")
    except ValueError:
        errors.append("Выберите дату доставки.")
    if form["slot"] not in SLOT_EXTRA:
        errors.append("Выберите интервал доставки.")
    if len(form["recipient"]) > 80 or len(form["card_text"]) > 200 or len(form["comment"]) > 300:
        errors.append("Одно из полей слишком длинное.")
    promo = form["promo"].upper() == PROMO_CODE
    if form["promo"] and not promo:
        errors.append("Такого промокода нет. Пустое поле тоже подходит.")

    with db() as connection:
        lines, goods = cart_details(connection)
        if not lines:
            errors.append("Корзина пустая.")
        if errors:
            preview = quote(goods, form["zone"] if form["zone"] in ZONE_PRICES else "center", form["slot"] if form["slot"] in SLOT_EXTRA else "13:00–16:00", promo)
            return render_template("cart.html", lines=lines, preview=preview, form=form, errors=errors), 400

        totals = quote(goods, form["zone"], form["slot"], promo)
        now = datetime.now().isoformat(timespec="minutes")
        cursor = connection.execute(
            """
            INSERT INTO orders (
                created_at, customer_name, phone, recipient, zone, address,
                delivery_date, slot, card_text, comment, goods_total, discount,
                delivery_price, total, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
            """,
            (
                now,
                form["name"],
                form["phone"],
                form["recipient"],
                form["zone"],
                "" if form["zone"] == "pickup" else form["address"],
                form["delivery_date"],
                form["slot"],
                form["card_text"],
                form["comment"],
                totals["goods"],
                totals["discount"],
                totals["delivery"],
                totals["total"],
            ),
        )
        order_id = cursor.lastrowid
        connection.executemany(
            "INSERT INTO order_items (order_id, product_name, qty, price) VALUES (?, ?, ?, ?)",
            [(order_id, line["product"]["name"], line["qty"], line["product"]["price"]) for line in lines],
        )
    save_cart({})
    session["seen_order"] = order_id
    return redirect(url_for("thanks", order_id=order_id))


@app.get("/order/<int:order_id>")
def thanks(order_id):
    if session.get("seen_order") != order_id and not session.get("admin"):
        return render_template("thanks.html", order=None, items=[])
    with db() as connection:
        order = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        items = connection.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    if order is None:
        abort(404)
    return render_template("thanks.html", order=order, items=items, zone_name=ZONE_NAMES.get(order["zone"], order["zone"]))


@app.get("/admin/login")
def login():
    if session.get("admin"):
        return redirect(url_for("admin_products"))
    return render_template("admin_login.html")


@app.post("/admin/login")
def login_post():
    require_csrf()
    if time.time() < session.get("login_until", 0):
        flash("Слишком много попыток. Подождите несколько минут.")
        return redirect(url_for("login"))
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    with db() as connection:
        user = connection.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        fails = session.get("fails", 0) + 1
        session["fails"] = fails
        if fails >= 8:
            session["login_until"] = time.time() + 300
            session["fails"] = 0
        flash("Неверное имя или пароль.")
        return redirect(url_for("login"))
    session.clear()
    session["admin"] = user["id"]
    session["csrf"] = secrets.token_hex(16)
    return redirect(url_for("admin_products"))


@app.post("/admin/logout")
def logout():
    require_csrf()
    session.clear()
    return redirect(url_for("home"))


@app.get("/admin")
@login_required
def admin_products():
    with db() as connection:
        products = connection.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
    return render_template("admin_products.html", products=products)


@app.get("/admin/products/new")
@login_required
def product_new():
    return render_template("admin_form.html", product=None, errors=[])


@app.post("/admin/products/new")
@login_required
def product_create():
    require_csrf()
    product, errors = read_product_form(None)
    if errors:
        return render_template("admin_form.html", product=product, errors=errors), 400
    with db() as connection:
        connection.execute(
            """
            INSERT INTO products (name, category, price, size, description, image, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (product["name"], product["category"], product["price"], product["size"], product["description"], product["image"], datetime.now().isoformat(timespec="minutes")),
        )
    flash("Букет добавлен на витрину.")
    return redirect(url_for("admin_products"))


@app.get("/admin/products/<int:product_id>")
@login_required
def product_edit(product_id):
    with db() as connection:
        product = connection.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if product is None:
        abort(404)
    return render_template("admin_form.html", product=product, errors=[])


@app.post("/admin/products/<int:product_id>")
@login_required
def product_update(product_id):
    require_csrf()
    with db() as connection:
        current = connection.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if current is None:
            abort(404)
        product, errors = read_product_form(current)
        if errors:
            return render_template("admin_form.html", product=product, errors=errors), 400
        connection.execute(
            """
            UPDATE products
            SET name = ?, category = ?, price = ?, size = ?, description = ?, image = ?
            WHERE id = ?
            """,
            (product["name"], product["category"], product["price"], product["size"], product["description"], product["image"], product_id),
        )
    flash("Букет обновлён.")
    return redirect(url_for("admin_products"))


@app.post("/admin/products/<int:product_id>/delete")
@login_required
def product_delete(product_id):
    require_csrf()
    with db() as connection:
        connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
    flash("Букет убран с витрины. Старые заказы сохранили его название.")
    return redirect(url_for("admin_products"))


def read_product_form(current):
    name = request.form.get("name", "").strip()
    category = request.form.get("category", "")
    price = parse_price(request.form.get("price", ""))
    size = request.form.get("size", "").strip()
    description = request.form.get("description", "").strip()
    errors = []
    if not 2 <= len(name) <= 80:
        errors.append("Название нужно от 2 до 80 символов.")
    if category not in CATEGORY_NAMES:
        errors.append("Выберите категорию.")
    if price is None:
        errors.append("Цена — целое число рублей, от 1 до 1 000 000.")
    if not 1 <= len(size) <= 40:
        errors.append("Укажите размер, например M или 15 шт.")
    if not 10 <= len(description) <= 500:
        errors.append("Описание нужно от 10 до 500 символов.")
    image = current["image"] if current is not None else ""
    try:
        uploaded = save_upload(request.files.get("image"))
    except ValueError as error:
        errors.append(str(error))
        uploaded = None
    if uploaded:
        image = uploaded
    if current is None and not image:
        errors.append("Для нового букета нужна фотография.")
    product = {
        "id": None if current is None else current["id"],
        "name": name,
        "category": category,
        "price": price or "",
        "size": size,
        "description": description,
        "image": image,
    }
    return product, errors


@app.get("/admin/orders")
@login_required
def admin_orders():
    with db() as connection:
        orders = connection.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
    return render_template("admin_orders.html", orders=orders)


@app.get("/admin/orders/<int:order_id>")
@login_required
def admin_order(order_id):
    with db() as connection:
        order = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        items = connection.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    if order is None:
        abort(404)
    return render_template(
        "admin_order.html",
        order=order,
        items=items,
        zone_name=ZONE_NAMES.get(order["zone"], order["zone"]),
    )


@app.post("/admin/orders/<int:order_id>/status")
@login_required
def order_status(order_id):
    require_csrf()
    status = request.form.get("status", "")
    if status not in STATUS_NAMES:
        abort(400)
    with db() as connection:
        connection.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    flash("Статус заказа обновлён.")
    return redirect(url_for("admin_order", order_id=order_id))


@app.errorhandler(404)
def not_found(_error):
    return render_template("error.html", title="Страница не найдена", text="Такой страницы нет. Вернитесь на витрину."), 404


@app.errorhandler(400)
def bad_request(error):
    text = error.description if error.description and error.description != "400 Bad Request" else "Форма устарела. Обновите страницу."
    return render_template("error.html", title="Не отправилось", text=text), 400


@app.errorhandler(413)
def too_large(_error):
    flash("Файл слишком большой. Нужна фотография до 5 МБ.")
    return redirect(url_for("admin_products"))


if __name__ == "__main__":
    init_db()
    print("Сайт: http://127.0.0.1:8765")
    print("Кабинет магазина: florist / pole-demo")
    app.run(host="127.0.0.1", port=8765, debug=False)
