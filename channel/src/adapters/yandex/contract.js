// Yandex courier delivery only. See partner.order.create; no Uzum schema alias.
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string'; }
function nonempty(value) { return text(value) && value.trim().length > 0; }
function amount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function dateTime(value) {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes impossible calendar dates (for example February 30).
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(value.slice(11, 13)) < 24;
}
function optionalFields(body, fields, check) {
  return fields.every((key) => body[key] === undefined || check(body[key]));
}
function phone(value) {
  return object(value) && optionalFields(value, ['number', 'extension'], text);
}

function safeObjectKeys(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    for (const key of Object.keys(current)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
      const nested = current[key];
      if (nested !== null && typeof nested === 'object') pending.push(nested);
    }
  }
  return true;
}

function validate(body) {
  if (!object(body)) return 'Order must be an object';
  // Reject keys before persistence can strip them and change retry identity.
  if (!safeObjectKeys(body)) return 'Invalid order object keys';
  if (body.discriminator !== 'yandex') return 'Only yandex courier delivery is supported';
  if (!text(body.comment) || !nonempty(body.eatsId)) return 'comment and eatsId are required';
  if (!object(body.deliveryInfo) || !dateTime(body.deliveryInfo.courierArrivementDate)) return 'Valid courierArrivementDate is required';
  const delivery = body.deliveryInfo;
  if (!optionalFields(delivery, ['clientName', 'phoneNumber', 'realPhoneNumber'], text)
    || !optionalFields(delivery, ['isSlotDelivery'], (value) => typeof value === 'boolean')
    || !optionalFields(delivery, ['deliveryAddress'], (value) => object(value)
      && optionalFields(value, ['full', 'latitude', 'longitude', 'city', 'entrance', 'flat', 'floor', 'house', 'intercom', 'region', 'street'], text))
    || !optionalFields(delivery, ['recipient'], (value) => object(value)
      && optionalFields(value, ['phone'], phone)
      && optionalFields(value, ['additionalPhones'], (phones) => Array.isArray(phones) && phones.every(phone)))) return 'Invalid deliveryInfo';
  if (!Array.isArray(body.items) || !body.items.every((item) => object(item)
    && nonempty(item.id) && item.id.length <= 64 && amount(item.price)
    && amount(item.quantity) && item.quantity > 0
    && optionalFields(item, ['name'], text) && optionalFields(item, ['originPrice'], amount))) return 'Invalid order items';
  if (!object(body.paymentInfo) || !amount(body.paymentInfo.itemsCost)
    || !['CARD', 'CASH'].includes(body.paymentInfo.paymentType)) return 'Invalid paymentInfo';
  if (!optionalFields(body, ['restaurantId', 'brand'], text)
    || !optionalFields(body, ['platform'], (value) => ['YE', 'DC', 'LAVKA', 'PHARMA', 'FLOWERS'].includes(value))
    || !optionalFields(body, ['promos'], (value) => Array.isArray(value)
      && value.every((promo) => object(promo) && text(promo.type) && amount(promo.discount)))) return 'Invalid order metadata';
  return null;
}

function snapshot(body, placeId) {
  return { ...JSON.parse(JSON.stringify(body)), restaurantId: body.restaurantId ?? placeId };
}

function validateStatus(body) {
  if (!object(body) || !safeObjectKeys(body)
    || Object.keys(body).some((key) => !['status', 'reason', 'comment', 'updatedAt', 'platform', 'attributes'].includes(key))
    || !['CANCELLED', 'TAKEN_BY_COURIER', 'DELIVERED'].includes(body.status)) return 'Invalid status';
  if (!optionalFields(body, ['reason', 'comment'], (value) => text(value) && value.length <= 256 * 1024)
    || !optionalFields(body, ['updatedAt'], dateTime)
    || !optionalFields(body, ['platform'], (value) => ['YE', 'DC', 'LAVKA', 'PHARMA', 'FLOWERS'].includes(value))
    || !optionalFields(body, ['attributes'], (value) => Array.isArray(value) && value.length <= 100
      && value.every((item) => text(item) && item.length <= 512))) return 'Invalid status metadata';
  return null;
}
module.exports = { validate, snapshot, validateStatus };
