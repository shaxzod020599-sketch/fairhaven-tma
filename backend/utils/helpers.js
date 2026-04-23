function formatUZS(amount) {
  return (Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

function yandexMapsLink(lat, lng) {
  return `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`;
}

function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paymentLabel(method) {
  switch (method) {
    case 'cash': return '💵 Naqd / Наличные';
    case 'card': return '💳 Karta / Карта';
    default: return method || '—';
  }
}

/**
 * Formats an order into a readable receipt for the operators channel.
 * Output is HTML-parse-mode Telegram safe.
 */
function formatOrderReceipt(order) {
  const itemLines = order.items
    .map((item, i) =>
      `  ${i + 1}. ${escapeHtml(item.name)} × ${item.quantity} = ${formatUZS(item.price * item.quantity)}`
    )
    .join('\n');

  const mapLink = googleMapsLink(order.location.lat, order.location.lng);
  const yMapLink = yandexMapsLink(order.location.lat, order.location.lng);
  const shortId = order._id.toString().slice(-6).toUpperCase();
  const createdAt = new Date(order.createdAt || Date.now())
    .toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });

  const parts = [];
  parts.push(`🧾 <b>Yangi buyurtma / Новый заказ</b>  #${shortId}`);
  parts.push('');
  parts.push(`👤 <b>Mijoz / Клиент:</b> ${escapeHtml(order.customerName) || '—'}`);
  parts.push(`📞 <b>Telefon / Телефон:</b> ${escapeHtml(order.customerPhone) || '—'}`);
  parts.push(`🆔 <b>Telegram ID:</b> <code>${order.telegramId}</code>`);
  parts.push('');
  parts.push(`📦 <b>Mahsulotlar / Товары:</b>`);
  parts.push(itemLines || '  —');
  parts.push('');
  parts.push(`💰 <b>Jami / Итого:</b> ${formatUZS(order.totalAmount)}`);
  parts.push(`💳 <b>To‘lov / Оплата:</b> ${paymentLabel(order.paymentMethod)}`);
  parts.push('');
  parts.push(`📍 <b>Manzil / Адрес:</b> ${escapeHtml(order.location.addressString) || '—'}`);
  parts.push(`🗺 <a href="${yMapLink}">Yandex Maps</a> · <a href="${mapLink}">Google Maps</a>`);
  if (order.notes) {
    parts.push('');
    parts.push(`📝 <b>Izoh / Комментарий:</b> ${escapeHtml(order.notes)}`);
  }
  parts.push('');
  parts.push(`🕐 ${createdAt} (Asia/Tashkent)`);

  return parts.join('\n');
}

module.exports = {
  formatUZS,
  yandexMapsLink,
  googleMapsLink,
  formatOrderReceipt,
  escapeHtml,
};
