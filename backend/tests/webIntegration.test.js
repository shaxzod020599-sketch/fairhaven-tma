const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { formatOrderReceipt } = require('../utils/helpers');

process.env.WEB_JWT_SECRET = process.env.WEB_JWT_SECRET || 'test-secret-key';
const {
  signSession,
  sessionCookieOptions,
} = require('../middleware/webAuth');

const WEB_LOGIN_PAYLOAD_RE = /^web_([A-Za-z0-9_-]{20,64})$/;

function fakeOrder(overrides = {}) {
  return {
    _id: { toString: () => 'aabbccddeeff001122334455' },
    items: [{ name: 'FH PRO for Women', price: 850000, quantity: 1 }],
    subtotal: 850000,
    deliveryFee: 0,
    discount: 0,
    totalAmount: 850000,
    paymentMethod: 'cash',
    customerName: 'Гость Сайта',
    customerPhone: '+998901234567',
    telegramId: null,
    location: { lat: 0, lng: 0, addressString: 'Ташкент, Чиланзар 5' },
    notes: '',
    createdAt: new Date('2026-07-01T10:00:00Z'),
    source: 'web-guest',
    ...overrides,
  };
}

test('web deep-link payload regex accepts base64url tokens and rejects junk', () => {
  const raw = crypto.randomBytes(32).toString('base64url');
  assert.match(`web_${raw}`, WEB_LOGIN_PAYLOAD_RE);
  assert.doesNotMatch('web_short', WEB_LOGIN_PAYLOAD_RE);
  assert.doesNotMatch(`web_${'x'.repeat(65)}`, WEB_LOGIN_PAYLOAD_RE);
  assert.doesNotMatch(`WEB_${raw}`, WEB_LOGIN_PAYLOAD_RE);
  assert.doesNotMatch('order:approve:123', WEB_LOGIN_PAYLOAD_RE);
});

test('web session JWT roundtrips and carries the telegram id', () => {
  const token = signSession({ telegramId: 123456789, _id: 'abc' });
  const payload = jwt.verify(token, process.env.WEB_JWT_SECRET);
  assert.equal(payload.tid, 123456789);
});

test('session cookie is httpOnly and lax', () => {
  const opts = sessionCookieOptions();
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.ok(opts.maxAge > 0);
});

test('guest web order receipt renders without telegram id or map links', () => {
  const text = formatOrderReceipt(fakeOrder());
  assert.ok(text.includes('Сайт (гость)'));
  assert.ok(!text.includes('Telegram ID'));
  assert.ok(!text.includes('yandex.uz/maps'));
  assert.ok(text.includes('Чиланзар 5'));
  assert.ok(text.includes('850 000 UZS'));
});

test('mini-app order receipt keeps telegram id and map links', () => {
  const text = formatOrderReceipt(fakeOrder({
    telegramId: 987654321,
    source: 'miniapp',
    location: { lat: 41.311, lng: 69.28, addressString: 'Ташкент, Юнусабад' },
  }));
  assert.ok(text.includes('987654321'));
  assert.ok(text.includes('yandex.uz/maps'));
  assert.ok(!text.includes('🌐'));
});

test('order receipt survives a missing location entirely', () => {
  const text = formatOrderReceipt(fakeOrder({ location: null }));
  assert.ok(text.includes('Manzil'));
  assert.ok(text.includes('—'));
});
