const SHOP = {
  name: "Поле",
  city: "Москва",
  phone: "+7 000 000-00-00",
  phoneTel: "+70000000000",
  address: "ул. Цветочная, 12",
  hours: "ежедневно, 9:00–21:00",
};

const PROMO = "POLE10";
const ADMIN = { user: "florist", password: "pole-demo" };

const CATEGORIES = [
  ["bouquets", "Букеты"],
  ["roses", "Розы"],
  ["gifts", "Подарки"],
  ["plants", "Растения"],
];

const ZONES = [
  ["pickup", "Самовывоз", 0],
  ["center", "Центр", 490],
  ["city", "Весь город", 790],
];

const SLOTS = [
  ["10:00–13:00", 0],
  ["13:00–16:00", 0],
  ["16:00–19:00", 0],
  ["19:00–21:00", 400],
];

const STATUSES = [
  ["new", "Новый"],
  ["making", "Собираем"],
  ["delivery", "В доставке"],
  ["done", "Доставлен"],
  ["cancelled", "Отменён"],
];

const SEED = [
  { id: 1, name: "Рассвет", category: "bouquets", price: 5400, size: "M", description: "Розы, эустома и эвкалипт. Свободная сборка, высота около 45 см.", image: "images/hero.jpg" },
  { id: 2, name: "Персиковый сад", category: "bouquets", price: 6200, size: "M", description: "Пионовидные розы, светлая гвоздика и эвкалипт. Лента в тон букета.", image: "images/p6.jpg" },
  { id: 3, name: "Красные розы", category: "roses", price: 5900, size: "15 шт.", description: "Пятнадцать красных роз одной длины. Классический букет без лишней зелени.", image: "images/p4.jpg" },
  { id: 4, name: "Тюльпаны", category: "bouquets", price: 3900, size: "15 шт.", description: "Розовые тюльпаны, пятнадцать стеблей. Оттенок сезона может чуть отличаться.", image: "images/p1.jpg" },
  { id: 5, name: "Подсолнухи", category: "bouquets", price: 4200, size: "M", description: "Крупные подсолнухи и зелень. Сезонный букет, пока цветок есть у поставщика.", image: "images/p3.jpg" },
  { id: 6, name: "Радужные розы", category: "roses", price: 4800, size: "11 шт.", description: "Окрашенные розы. Яркий букет, если нужен не классический цвет.", image: "images/p7.jpg" },
  { id: 7, name: "Сердце", category: "gifts", price: 4500, size: "S", description: "Композиция в форме сердца. Оттенки подбираем близко к фотографии.", image: "images/p2.jpg" },
  { id: 8, name: "Хавортия в горшке", category: "plants", price: 1900, size: "S", description: "Небольшое растение в керамическом горшке. Живёт дольше срезанного букета.", image: "images/p9.jpg" },
];

const categoryName = Object.fromEntries(CATEGORIES);
const zoneName = Object.fromEntries(ZONES.map(([id, title]) => [id, title]));
const zonePrice = Object.fromEntries(ZONES.map(([id, , price]) => [id, price]));
const slotExtra = Object.fromEntries(SLOTS);
const statusName = Object.fromEntries(STATUSES);

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function products() {
  const stored = load("pole-products", null);
  if (!Array.isArray(stored) || !stored.length) {
    save("pole-products", SEED);
    return SEED.map((item) => ({ ...item }));
  }
  return stored;
}

function cart() {
  const stored = load("pole-cart", {});
  return stored && typeof stored === "object" ? stored : {};
}

function orders() {
  const stored = load("pole-orders", []);
  return Array.isArray(stored) ? stored : [];
}

function money(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function validPhone(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && (digits[0] === "7" || digits[0] === "8"));
}

function quote(goods, zone, slot, promoOn) {
  const discount = promoOn ? Math.round(goods * 0.1) : 0;
  const delivery = (zonePrice[zone] || 0) + (slotExtra[slot] || 0);
  return { goods, discount, delivery, total: Math.max(0, goods - discount + delivery) };
}

function cartLines() {
  const current = cart();
  return products().filter((item) => current[item.id]).map((item) => ({
    product: item,
    qty: Math.min(20, Number(current[item.id]) || 1),
    sum: item.price * Math.min(20, Number(current[item.id]) || 1),
  }));
}

function setQty(id, qty) {
  const current = cart();
  if (qty <= 0) delete current[id];
  else current[id] = Math.min(20, qty);
  save("pole-cart", current);
  render();
}

function route() {
  const raw = location.hash.replace(/^#/, "") || "home";
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { page: parts[0] || "home", arg: parts[1] || "", query };
}

function render() {
  const count = Object.values(cart()).reduce((sum, qty) => sum + Number(qty || 0), 0);
  const badge = document.getElementById("cart-count");
  if (badge) badge.textContent = String(count);
  const { page, arg } = route();
  const view = document.getElementById("view");
  const pages = { home: homeView, delivery: homeView, product: productView, cart: cartView, thanks: thanksView, admin: adminView };
  view.innerHTML = (pages[page] || homeView)(arg);
  if (page === "home" || page === "delivery") bindHome();
  if (page === "cart") bindCart();
  if (page === "admin") bindAdmin(arg);
  if (page === "delivery") {
    const block = document.getElementById("delivery");
    if (block) block.scrollIntoView();
  }
  const menu = document.querySelector(".menu");
  if (menu) menu.open = false;
}

function homeView() {
  const params = new URLSearchParams(route().query);
  const category = params.get("category") || "all";
  const query = (params.get("q") || "").trim().toLowerCase();
  const list = products().filter((item) => {
    const categoryOk = category === "all" || item.category === category;
    const text = (item.name + " " + item.description).toLowerCase();
    return categoryOk && (!query || text.includes(query));
  });
  const counts = { all: products().length };
  CATEGORIES.forEach(([key]) => { counts[key] = products().filter((item) => item.category === key).length; });
  const cards = list.map((item) => `
    <article class="card">
      <a class="photo" href="#product/${item.id}"><img src="${esc(item.image)}" alt="${esc(item.name)}" /></a>
      <div class="card-body">
        <h3><a href="#product/${item.id}">${esc(item.name)}</a></h3>
        <p>${esc(item.description)}</p>
        <div class="card-row"><span class="price">${money(item.price)}</span><span class="size">${esc(item.size)}</span></div>
        <button class="add" type="button" data-add="${item.id}">В корзину</button>
      </div>
    </article>`).join("");
  return `
    <section class="hero">
      <div>
        <p class="eyebrow">Цветочный магазин</p>
        <h1>Букет, который не выглядит случайным</h1>
        <p class="lead">Свежие цветы, открытка своим текстом и доставка ко времени. Заказ сразу виден флористу: состав, адрес и пожелания.</p>
        <div class="hero-actions">
          <a class="btn" href="#home">Смотреть витрину</a>
          <a class="btn btn-ghost" href="#cart">Открыть корзину</a>
        </div>
        <ul class="hero-points">
          <li>Сборка в день заказа</li>
          <li>Фото букета перед выездом</li>
          <li>Оплата при получении</li>
        </ul>
      </div>
      <figure class="hero-photo"><img src="images/hero.jpg" alt="Сборный букет с розами и эвкалиптом" /></figure>
    </section>
    <section class="catalog" id="catalog">
      <div class="section-head">
        <div>
          <h2>Витрина</h2>
          <p>Букеты магазин добавляет и убирает сам, из своего кабинета.</p>
        </div>
        <form class="search" id="search-form">
          <label><span class="sr">Найти букет</span>
            <input type="search" name="q" value="${esc(params.get("q") || "")}" placeholder="Найти: розы, тюльпаны, сердце" />
          </label>
        </form>
      </div>
      <div class="filters">
        <a class="${category === "all" ? "is-on" : ""}" href="#home">Все · ${counts.all}</a>
        ${CATEGORIES.map(([key, title]) => `<a class="${category === key ? "is-on" : ""}" href="#home?category=${key}">${title} · ${counts[key]}</a>`).join("")}
      </div>
      ${list.length ? `<div class="grid">${cards}</div>` : `<p class="empty">Ничего не нашлось.</p>`}
    </section>
    <section class="split" id="delivery">
      <div>
        <h2>Доставка</h2>
        <p>Курьер привозит букет в выбранный интервал. Если нужного цветка нет, флорист пишет до замены.</p>
      </div>
      <dl class="zones">
        ${ZONES.map(([, title, price]) => `<div><dt>${title}</dt><dd>${money(price)}</dd></div>`).join("")}
        <div><dt>После 19:00</dt><dd>+400 ₽</dd></div>
      </dl>
    </section>
    <section class="split">
      <div>
        <h2>Магазин</h2>
        <p>${esc(SHOP.name)} в городе ${esc(SHOP.city)}. Букеты собирают в магазине и привозят в выбранный интервал.</p>
        <p><a href="tel:${SHOP.phoneTel}">${esc(SHOP.phone)}</a></p>
        <p>${esc(SHOP.address)}</p>
        <p>${esc(SHOP.hours)}</p>
      </div>
      <ol class="steps">
        <li>Выбираете букет, дату и интервал.</li>
        <li>Оставляете телефон, адрес и текст открытки.</li>
        <li>Заказ сохраняется, флорист видит его в кабинете.</li>
        <li>Курьер привозит. Оплата при получении.</li>
      </ol>
    </section>`;
}

function productView(id) {
  const item = products().find((product) => String(product.id) === String(id));
  if (!item) return `<section class="sheet narrow"><h1>Букет не найден</h1><a class="btn" href="#home">На витрину</a></section>`;
  return `
    <article class="product">
      <figure><img src="${esc(item.image)}" alt="${esc(item.name)}" /></figure>
      <div>
        <p class="eyebrow">${esc(categoryName[item.category] || "")}</p>
        <h1>${esc(item.name)}</h1>
        <p class="lead">${esc(item.description)}</p>
        <p class="price big">${money(item.price)} · ${esc(item.size)}</p>
        <form class="qty-form" id="add-form">
          <label>Количество <input type="number" name="qty" min="1" max="20" value="1" /></label>
          <button class="btn" type="submit">В корзину</button>
        </form>
      </div>
    </article>`;
}

function cartView() {
  const lines = cartLines();
  if (!lines.length) {
    return `<section class="sheet"><h1>Корзина</h1><p>Пока пусто.</p><a class="btn" href="#home">К витрине</a></section>`;
  }
  const goods = lines.reduce((sum, line) => sum + line.sum, 0);
  const preview = quote(goods, "center", "13:00–16:00", false);
  return `
    <section class="sheet">
      <h1>Корзина</h1>
      <div class="lines">
        ${lines.map((line) => `
          <div class="cart-item">
            <div><strong>${esc(line.product.name)}</strong><span class="muted">${money(line.product.price)}</span></div>
            <div class="qty">
              <button type="button" data-qty="${line.product.id}" data-step="-1" aria-label="Меньше">−</button>
              <span>${line.qty}</span>
              <button type="button" data-qty="${line.product.id}" data-step="1" aria-label="Больше">+</button>
            </div>
          </div>`).join("")}
      </div>
      <form id="checkout" data-goods="${goods}">
        <p class="form-error" id="form-error"></p>
        <label class="field"><span>Ваше имя</span><input name="name" required maxlength="80" autocomplete="name" /></label>
        <label class="field"><span>Телефон</span><input name="phone" required maxlength="20" inputmode="tel" placeholder="+7 900 000-00-00" /></label>
        <label class="field"><span>Имя получателя</span><input name="recipient" maxlength="80" /></label>
        <label class="field"><span>Зона доставки</span><select name="zone">${ZONES.map(([id, title, price]) => `<option value="${id}" data-price="${price}" ${id === "center" ? "selected" : ""}>${title} — ${money(price)}</option>`).join("")}</select></label>
        <label class="field"><span>Адрес</span><input name="address" maxlength="200" placeholder="Улица, дом, квартира" /></label>
        <label class="field"><span>Дата</span><input name="delivery_date" type="date" required min="${today()}" value="${today()}" /></label>
        <label class="field"><span>Интервал</span><select name="slot">${SLOTS.map(([label, extra]) => `<option value="${label}" data-extra="${extra}" ${label.startsWith("13:") ? "selected" : ""}>${label}${extra ? " · +" + money(extra) : ""}</option>`).join("")}</select></label>
        <label class="field"><span>Текст открытки</span><textarea name="card_text" maxlength="200" rows="3"></textarea></label>
        <label class="field"><span>Комментарий флористу</span><textarea name="comment" maxlength="300" rows="3"></textarea></label>
        <label class="field"><span>Промокод</span><input name="promo" maxlength="20" placeholder="${PROMO}" /></label>
        <div class="totals">
          <div class="sum-row"><span>Букеты</span><span>${money(preview.goods)}</span></div>
          <div class="sum-row" id="sum-discount-row" hidden><span>Скидка 10%</span><span id="sum-discount"></span></div>
          <div class="sum-row"><span>Доставка</span><span id="sum-delivery">${money(preview.delivery)}</span></div>
          <div class="sum-row"><span>Итого</span><span id="sum-total">${money(preview.total)}</span></div>
        </div>
        <button class="btn wide" type="submit">Оформить заказ</button>
      </form>
    </section>`;
}

function thanksView() {
  const order = orders().find((item) => String(item.id) === String(sessionStorage.getItem("pole-last-order")));
  if (!order) return `<section class="sheet"><h1>Заказ принят</h1><a class="btn" href="#home">На витрину</a></section>`;
  const lines = order.items.map((item) => `${item.qty} × ${item.name} — ${money(item.price * item.qty)}`).join("\n");
  return `
    <section class="sheet">
      <h1>Заказ принят</h1>
      <p>Флорист видит это в кабинете этого браузера. Оплата при получении.</p>
      <pre class="receipt">Заказ «${esc(SHOP.name)}» №${order.id}
Имя: ${esc(order.name)}
Телефон: ${esc(order.phone)}
Доставка: ${esc(zoneName[order.zone] || order.zone)}
${order.address ? "Адрес: " + esc(order.address) + "\n" : ""}Когда: ${esc(order.date)} , ${esc(order.slot)}

${esc(lines)}
${order.discount ? "Скидка: −" + money(order.discount) + "\n" : ""}Доставка: ${money(order.delivery)}
Итого: ${money(order.total)}</pre>
      <a class="btn" href="#home">На витрину</a>
    </section>`;
}

function adminView(arg) {
  if (sessionStorage.getItem("pole-admin") !== "1") {
    return `
      <section class="sheet narrow">
        <h1>Кабинет магазина</h1>
        <p class="muted">Для примера вход уже создан.</p>
        <form id="login-form">
          <p class="form-error" id="form-error"></p>
          <label class="field"><span>Имя</span><input name="username" value="florist" autocomplete="username" /></label>
          <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" /></label>
          <button class="btn wide" type="submit">Войти</button>
        </form>
        <p class="demo-note">Пример: имя <strong>florist</strong>, пароль <strong>pole-demo</strong>.</p>
      </section>`;
  }
  if (arg === "new" || (arg && arg.startsWith("edit"))) return adminForm(arg);
  if (arg === "orders") return adminOrders();
  if (arg && arg.startsWith("order")) return adminOrder(arg.slice(5));
  const cards = products().map((item) => `
    <article class="admin-card">
      <a class="photo" href="#admin/edit${item.id}"><img src="${esc(item.image)}" alt="" /></a>
      <div>
        <h2>${esc(item.name)}</h2>
        <p>${money(item.price)} · ${esc(item.size)} · ${esc(categoryName[item.category] || "")}</p>
        <div class="row-actions">
          <a href="#admin/edit${item.id}">Изменить</a>
          <button type="button" data-delete="${item.id}">Удалить</button>
        </div>
      </div>
    </article>`).join("");
  return `
    <section class="office">
      ${adminNav()}
      <div class="section-head"><h1>Букеты</h1><a class="btn" href="#admin/new">Добавить букет</a></div>
      <div class="admin-grid">${cards}</div>
    </section>`;
}

function adminNav() {
  return `<div class="office-nav"><a href="#admin">Букеты</a><a href="#admin/orders">Заказы</a><a href="#home">На витрину</a><button type="button" id="logout">Выйти</button></div>`;
}

function adminForm(arg) {
  const id = arg.startsWith("edit") ? arg.slice(4) : "";
  const item = products().find((product) => String(product.id) === id) || { name: "", category: "bouquets", price: "", size: "", description: "", image: "" };
  return `
    <section class="office">
      ${adminNav()}
      <h1>${id ? "Изменить букет" : "Новый букет"}</h1>
      <form class="product-form" id="product-form">
        <p class="form-error" id="form-error"></p>
        ${item.image ? `<img class="preview" src="${esc(item.image)}" alt="" />` : ""}
        <label class="field"><span>Название</span><input name="name" required maxlength="80" value="${esc(item.name)}" /></label>
        <label class="field"><span>Категория</span><select name="category">${CATEGORIES.map(([key, title]) => `<option value="${key}" ${item.category === key ? "selected" : ""}>${title}</option>`).join("")}</select></label>
        <label class="field"><span>Цена, ₽</span><input name="price" required inputmode="numeric" value="${esc(item.price)}" /></label>
        <label class="field"><span>Размер</span><input name="size" required maxlength="40" value="${esc(item.size)}" placeholder="M или 15 шт." /></label>
        <label class="field"><span>Описание</span><textarea name="description" required maxlength="500" rows="4">${esc(item.description)}</textarea></label>
        <label class="field"><span>Фотография</span><input name="image" type="file" accept=".jpg,.jpeg,.png,.webp" /></label>
        <button class="btn" type="submit">Сохранить</button>
      </form>
    </section>`;
}

function adminOrders() {
  const list = orders();
  const cards = list.map((order) => `<a class="order-card" href="#admin/order${order.id}"><strong>№${order.id} · ${esc(order.name)}</strong><span>${money(order.total)}</span><p>${esc(order.date)} · ${esc(order.slot)} · ${esc(statusName[order.status] || "")}</p></a>`).join("");
  return `<section class="office">${adminNav()}<h1>Заказы</h1>${list.length ? `<div class="order-list">${cards}</div>` : "<p>Заказов пока нет. Оформите пробный с витрины.</p>"}</section>`;
}

function adminOrder(id) {
  const order = orders().find((item) => String(item.id) === String(id));
  if (!order) return `<section class="office">${adminNav()}<h1>Заказ не найден</h1></section>`;
  return `
    <section class="office">
      ${adminNav()}
      <p class="eyebrow">Заказ №${order.id}</p>
      <h1>${esc(order.name)}</h1>
      <p><a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></p>
      <dl class="facts">
        <div><dt>Когда</dt><dd>${esc(order.date)}, ${esc(order.slot)}</dd></div>
        <div><dt>Куда</dt><dd>${esc(zoneName[order.zone] || "")}${order.address ? " · " + esc(order.address) : ""}</dd></div>
      </dl>
      <ul class="plain">${order.items.map((item) => `<li>${item.qty} × ${esc(item.name)} — ${money(item.price * item.qty)}</li>`).join("")}</ul>
      <p class="price big">Итого ${money(order.total)}</p>
      <form id="status-form" class="status-form">
        <label class="field"><span>Статус</span><select name="status">${STATUSES.map(([key, title]) => `<option value="${key}" ${order.status === key ? "selected" : ""}>${title}</option>`).join("")}</select></label>
        <button class="btn" type="submit">Сохранить статус</button>
      </form>
    </section>`;
}

function bindHome() {
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = cart();
      const id = button.dataset.add;
      current[id] = Math.min(20, Number(current[id] || 0) + 1);
      save("pole-cart", current);
      render();
    });
  });
  const form = document.getElementById("search-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = new FormData(form).get("q");
      location.hash = query ? "#home?q=" + encodeURIComponent(query) : "#home";
    });
  }
}

function bindCart() {
  document.querySelectorAll("[data-qty]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = cart();
      const id = button.dataset.qty;
      setQty(id, Number(current[id] || 1) + Number(button.dataset.step));
    });
  });
  const form = document.getElementById("checkout");
  if (!form) return;
  const refresh = () => {
    const goods = Number(form.dataset.goods);
    const zone = Number(form.zone.selectedOptions[0].dataset.price || 0);
    const extra = Number(form.slot.selectedOptions[0].dataset.extra || 0);
    const discount = form.promo.value.trim().toUpperCase() === PROMO ? Math.round(goods * 0.1) : 0;
    document.getElementById("sum-discount-row").hidden = discount === 0;
    document.getElementById("sum-discount").textContent = "−" + money(discount);
    document.getElementById("sum-delivery").textContent = money(zone + extra);
    document.getElementById("sum-total").textContent = money(Math.max(0, goods - discount + zone + extra));
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const error = document.getElementById("form-error");
    if (data.name.trim().length < 2) { error.textContent = "Напишите имя."; return; }
    if (!validPhone(data.phone)) { error.textContent = "Телефон нужен в формате +7 и ещё десять цифр."; return; }
    if (data.zone !== "pickup" && data.address.trim().length < 8) { error.textContent = "Для доставки нужен адрес: улица и дом."; return; }
    const lines = cartLines();
    const promoOn = data.promo.trim().toUpperCase() === PROMO;
    if (data.promo.trim() && !promoOn) { error.textContent = "Такого промокода нет."; return; }
    const goods = lines.reduce((sum, line) => sum + line.sum, 0);
    const totals = quote(goods, data.zone, data.slot, promoOn);
    const next = orders();
    const order = {
      id: Date.now() % 100000,
      name: data.name.trim(),
      phone: data.phone.trim(),
      recipient: data.recipient.trim(),
      zone: data.zone,
      address: data.zone === "pickup" ? "" : data.address.trim(),
      date: data.delivery_date,
      slot: data.slot,
      card: data.card_text.trim(),
      comment: data.comment.trim(),
      items: lines.map((line) => ({ name: line.product.name, qty: line.qty, price: line.product.price })),
      discount: totals.discount,
      delivery: totals.delivery,
      total: totals.total,
      status: "new",
    };
    next.unshift(order);
    save("pole-orders", next);
    save("pole-cart", {});
    sessionStorage.setItem("pole-last-order", String(order.id));
    location.hash = "#thanks";
  });
}

function bindAdmin(arg) {
  const login = document.getElementById("login-form");
  if (login) {
    login.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(login).entries());
      if (data.username.trim() === ADMIN.user && data.password === ADMIN.password) {
        sessionStorage.setItem("pole-admin", "1");
        render();
      } else {
        document.getElementById("form-error").textContent = "Неверное имя или пароль.";
      }
    });
  }
  const logout = document.getElementById("logout");
  if (logout) logout.addEventListener("click", () => { sessionStorage.removeItem("pole-admin"); location.hash = "#admin"; });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      save("pole-products", products().filter((item) => String(item.id) !== button.dataset.delete));
      render();
    });
  });
  const form = document.getElementById("product-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const price = Number(String(data.price).replace(/\s/g, ""));
      const error = document.getElementById("form-error");
      if (data.name.trim().length < 2 || !Number.isInteger(price) || price < 1 || data.description.trim().length < 10) {
        error.textContent = "Проверьте название, цену и описание.";
        return;
      }
      const id = arg && arg.startsWith("edit") ? Number(arg.slice(4)) : Date.now() % 100000;
      const list = products();
      const current = list.find((item) => item.id === id);
      let image = current ? current.image : "";
      const file = form.image.files[0];
      if (file) {
        if (file.size > 1024 * 1024) { error.textContent = "Для примера фотография должна быть меньше 1 МБ."; return; }
        image = await file.arrayBuffer().then((buffer) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        }));
      }
      if (!image) { error.textContent = "Добавьте фотографию."; return; }
      const next = { id, name: data.name.trim(), category: data.category, price, size: data.size.trim(), description: data.description.trim(), image };
      const without = list.filter((item) => item.id !== id);
      save("pole-products", [next, ...without]);
      location.hash = "#admin";
    });
  }
  const status = document.getElementById("status-form");
  if (status && arg && arg.startsWith("order")) {
    status.addEventListener("submit", (event) => {
      event.preventDefault();
      const id = arg.slice(5);
      const list = orders().map((order) => order.id === Number(id) || String(order.id) === id ? { ...order, status: new FormData(status).get("status") } : order);
      save("pole-orders", list);
      location.hash = "#admin/orders";
    });
  }
}

window.addEventListener("hashchange", render);
document.querySelectorAll(".menu a").forEach((link) => link.addEventListener("click", () => { document.querySelector(".menu").open = false; }));
render();
