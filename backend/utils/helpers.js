function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a number as UZS currency string
 * @param {number} amount
 * @returns {string} e.g. "150 000 UZS"
 */
function formatUZS(amount) {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

/**
 * Generates a Yandex Maps link from coordinates
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function yandexMapsLink(lat, lng) {
  return `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`;
}

/**
 * Generates a Google Maps link from coordinates
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Formats an order into a readable receipt for Telegram
 * @param {Object} order
 * @returns {string} HTML-formatted receipt
 */
function formatOrderReceipt(order) {
  const itemLines = order.items
    .map((item, i) => `  ${i + 1}. ${item.name} × ${item.quantity} = ${formatUZS(item.price * item.quantity)}`)
    .join('\n');

  const mapLink = googleMapsLink(order.location.lat, order.location.lng);
  const yMapLink = yandexMapsLink(order.location.lat, order.location.lng);
  const customerName = escapeHtml(order.customerName || 'Не указано');
  const customerPhone = escapeHtml(order.customerPhone || 'Не указано');
  const addressString = escapeHtml(order.location.addressString || '');
  const notes = order.notes ? escapeHtml(order.notes) : '';

  return `🧾 <b>Новый заказ #${order._id.toString().slice(-6).toUpperCase()}</b>

👤 <b>Клиент:</b> ${customerName}
📞 <b>Телефон:</b> ${customerPhone}
🆔 <b>Telegram ID:</b> ${order.telegramId}

📦 <b>Товары:</b>
${itemLines}

💰 <b>Итого:</b> ${formatUZS(order.totalAmount)}

📍 <b>Адрес:</b> ${addressString}
🗺 <a href="${yMapLink}">Yandex Maps</a> | <a href="${mapLink}">Google Maps</a>

${notes ? `📝 <b>Примечание:</b> ${notes}` : ''}
🕐 ${new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`;
}

module.exports = {
  formatUZS,
  yandexMapsLink,
  googleMapsLink,
  formatOrderReceipt,
};
