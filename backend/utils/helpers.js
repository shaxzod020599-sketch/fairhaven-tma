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

  // Web orders may carry a text-only address (lat/lng = 0) or no location.
  const loc = order.location || null;
  const hasCoords = Boolean(loc) && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) &&
    (loc.lat !== 0 || loc.lng !== 0);
  const mapLink = hasCoords ? googleMapsLink(loc.lat, loc.lng) : null;
  const yMapLink = hasCoords ? yandexMapsLink(loc.lat, loc.lng) : null;
  const shortId = order._id.toString().slice(-6).toUpperCase();
  const createdAt = new Date(order.createdAt || Date.now())
    .toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });

  const sourceLabel = order.source === 'web' ? '🌐 Сайт'
    : order.source === 'web-guest' ? '🌐 Сайт (гость)'
    : '';

  const parts = [];
  parts.push(`🧾 <b>Yangi buyurtma / Новый заказ</b>  #${shortId}${sourceLabel ? `  ·  ${sourceLabel}` : ''}`);
  parts.push('');
  parts.push(`👤 <b>Mijoz / Клиент:</b> ${escapeHtml(order.customerName) || '—'}`);
  parts.push(`📞 <b>Telefon / Телефон:</b> ${escapeHtml(order.customerPhone) || '—'}`);
  if (order.telegramId) {
    parts.push(`🆔 <b>Telegram ID:</b> <code>${order.telegramId}</code>`);
  }
  if (order.email) {
    parts.push(`✉️ <b>Email:</b> ${escapeHtml(order.email)}`);
  }
  parts.push('');
  parts.push(`📦 <b>Mahsulotlar / Товары:</b>`);
  parts.push(itemLines || '  —');
  parts.push('');
  if (order.subtotal && order.subtotal !== order.totalAmount) {
    parts.push(`📊 <b>Подытог:</b> ${formatUZS(order.subtotal)}`);
  }
  if (order.discount > 0) {
    const promoTag = order.promoCode ? ` (${escapeHtml(order.promoCode)})` : '';
    parts.push(`🎟 <b>Скидка${promoTag}:</b> −${formatUZS(order.discount)}`);
  }
  if (order.deliveryFee && order.deliveryFee > 0) {
    parts.push(`🚚 <b>Доставка:</b> ${formatUZS(order.deliveryFee)}`);
  }
  parts.push(`💰 <b>Jami / Итого:</b> ${formatUZS(order.totalAmount)}`);
  if (order.isFirstOrder) {
    parts.push(`✨ <b>Первый заказ клиента</b>`);
  }
  parts.push(`💳 <b>To‘lov / Оплата:</b> ${paymentLabel(order.paymentMethod)}`);
  parts.push('');
  parts.push(`📍 <b>Manzil / Адрес:</b> ${escapeHtml(loc ? loc.addressString : '') || '—'}`);
  if (hasCoords) {
    parts.push(`🗺 <a href="${yMapLink}">Yandex Maps</a> · <a href="${mapLink}">Google Maps</a>`);
  }
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
