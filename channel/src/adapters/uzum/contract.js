// Supported YGroceryOrderV2 fields. Keep this boundary independent of Mongo.
const TOP = ['discriminator', 'comment', 'deliveryInfo', 'eatsId', 'items', 'paymentInfo', 'persons', 'promos', 'restaurantId'];
const ITEM = ['id', 'modifications', 'name', 'price', 'promos', 'quantity', 'labelCodes'];
const DELIVERY = ['clientName', 'courierArrivementDate', 'phoneNumber', 'clientPhoneNumber'];
const PAYMENT = ['itemsCost', 'paymentType'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v, allowed) => object(v) && Object.keys(v).every((k) => allowed.includes(k));
const string = (v) => typeof v === 'string';
const id = (v) => string(v) && v.trim().length > 0 && v.length <= 64;
const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const pick = (v, keys) => Object.fromEntries(keys.filter((k) => Object.hasOwn(v, k)).map((k) => [k, v[k]]));

function validTimestamp(value) {
  if (!string(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.slice(1).map((part) => Number(part || 0));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour < 24 && minute < 60 && second < 60
    && offsetHour < 24 && offsetMinute < 60;
}

function validate(body) {
  const bad = (error, code = 400) => ({ error, code });
  if (!fields(body, TOP)) return bad('Unsupported order fields');
  if (!id(body.eatsId)) return bad('eatsId must be a nonempty string of at most 64 characters');
  if (!string(body.comment) || !Array.isArray(body.promos)) return bad('comment and promos are required');
  if (body.discriminator !== undefined && body.discriminator !== 'uzum') return bad('Unsupported discriminator', 422);
  if (body.restaurantId !== undefined && !id(body.restaurantId)) return bad('Invalid restaurantId');
  if (body.persons !== undefined && (!Number.isSafeInteger(body.persons) || body.persons <= 0)) return bad('Invalid persons');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 200) return bad('items must contain 1 to 200 products');
  if (body.promos.length) return bad('Order promos are unsupported', 422);
  for (const item of body.items) {
    if (!fields(item, ITEM) || !id(item.id) || !positive(item.price) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return bad('Invalid item id, price or piece quantity');
    if (!Array.isArray(item.modifications) || !Array.isArray(item.promos)) return bad('Item modifications and promos arrays are required');
    if (item.modifications.length || item.promos.length) return bad('Item modifications and promos are unsupported', 422);
    if (item.name !== undefined && !string(item.name)) return bad('Invalid item name');
    if (item.labelCodes !== undefined && (!Array.isArray(item.labelCodes) || !item.labelCodes.every(string))) return bad('Invalid labelCodes');
  }
  if (body.paymentInfo !== undefined) {
    const p = body.paymentInfo;
    if (!fields(p, PAYMENT) || !positive(p.itemsCost) || !['CARD', 'CASH'].includes(p.paymentType)) return bad('Invalid paymentInfo');
  }
  if (body.deliveryInfo !== undefined) {
    const d = body.deliveryInfo;
    if (!fields(d, DELIVERY) || !Object.values(d).every(string)
      || !validTimestamp(d.courierArrivementDate)) return bad('Invalid deliveryInfo');
  }
  const total = body.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  if (!positive(total)) return bad('Invalid order total');
  if (body.paymentInfo && Math.abs(body.paymentInfo.itemsCost - total) > 0.001) return bad('paymentInfo.itemsCost does not match items', 422);
  return null;
}

function snapshot(body) {
  const out = pick(body, TOP);
  out.items = body.items.map((item) => ({ ...pick(item, ITEM), modifications: [], promos: [], ...(item.labelCodes ? { labelCodes: [...item.labelCodes] } : {}) }));
  out.promos = [];
  if (body.deliveryInfo) out.deliveryInfo = pick(body.deliveryInfo, DELIVERY);
  if (body.paymentInfo) out.paymentInfo = pick(body.paymentInfo, PAYMENT);
  return out;
}

module.exports = { validate, snapshot };
