const form = document.querySelector("#checkout");

function money(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

if (form) {
  const goods = Number(form.dataset.goods);
  const promoCode = form.dataset.promo;
  const discountRow = document.getElementById("sum-discount-row");

  function refresh() {
    const zone = Number(form.zone.selectedOptions[0].dataset.price || 0);
    const extra = Number(form.slot.selectedOptions[0].dataset.extra || 0);
    const code = form.promo.value.trim().toUpperCase();
    const discount = code === promoCode ? Math.round(goods * 0.1) : 0;
    const delivery = zone + extra;
    discountRow.hidden = discount === 0;
    document.getElementById("sum-discount").textContent = "−" + money(discount);
    document.getElementById("sum-delivery").textContent = money(delivery);
    document.getElementById("sum-total").textContent = money(Math.max(0, goods - discount + delivery));
  }

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  refresh();
}
