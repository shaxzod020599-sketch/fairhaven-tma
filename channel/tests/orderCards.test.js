const test = require('node:test');
const assert = require('node:assert/strict');

// Rendering is pure; the config module only needs a well-formed URI, nothing connects.
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/order-cards-test';
process.env.BILLZ_SECRET_TOKEN = 'local-test';
process.env.BILLZ_SHOP_ID = 'local-shop';
process.env.BILLZ_WRITE_ENABLED = 'true';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.YANDEX_ENABLED = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'local-internal-test-token';

const { clock, mapLink, note, payment, timeline } = require('../src/notify/format');

const id = '11111111-1111-4111-8111-111111111111';
// 10:00 UTC is 15:00 in Tashkent.
const at = new Date('2026-09-08T10:00:00Z');

test('card helpers render nothing for what a marketplace left out or sent malformed', () => {
  assert.equal(clock('2026-09-08T10:15:00.000Z', at), '15:15');
  assert.equal(clock(new Date('2026-09-08T10:15:00Z'), at), '15:15');
  assert.equal(clock('2026-09-08T15:15:27.87+05:00', at), '15:15');
  // Another Tashkent day gets its date, including one that is the same UTC day.
  assert.equal(clock('2026-09-08T20:30:00Z', at), '09.09 01:30');
  for (const bad of [undefined, null, '', 'soon', 42, {}, [], 'x'.repeat(65), new Date('nope')]) assert.equal(clock(bad, at), '');

  assert.equal(note('  call\n\nme <b>now</b> & wait  '), 'call me &lt;b&gt;now&lt;/b&gt; &amp; wait');
  assert.equal(note('x'.repeat(500), 20).length, 20);
  for (const bad of [undefined, null, 42, {}, ['a']]) assert.equal(note(bad), '');

  assert.equal(payment('CARD'), '💳 Оплата: картой');
  assert.equal(payment('CASH'), '💵 Оплата: наличными');
  for (const bad of [undefined, 'card', 'toString', 7, {}]) assert.equal(payment(bad), '');

  assert.equal(timeline([['принят', '2026-09-08T10:02:00Z'], ['готов', null], ['доставлен', 'x']], at), 'принят 15:02');
  assert.equal(timeline([['принят', undefined]], at), '');

  assert.equal(mapLink(41.311081, 69.240562, 'карта'),
    '<a href="https://yandex.uz/maps/?pt=69.240562,41.311081&amp;z=17&amp;l=map">карта</a>');
  for (const [lat, lon] of [[0, 0], ['41.3', '69.2'], [91, 69], [41, 181], [NaN, 69], [undefined, undefined]]) {
    assert.equal(mapLink(lat, lon, 'карта'), '');
  }
});

function uzumRow(extra = {}) {
  return { _id: 'row', channel: 'uzum', internalOrderId: id, externalId: '251111-123456', createdAt: at,
    status: 'received', totalAmount: 350000, billz: {}, customer: { name: 'Akmal', phone: '' },
    items: [{ billzProductId: 'p1', name: 'IsoFresh', quantity: 1, unitPrice: 350000 }],
    rawIn: { comment: 'Позвонить <заранее>', paymentInfo: { paymentType: 'CARD', itemsCost: 350000 },
      deliveryInfo: { clientName: 'Akmal', phoneNumber: '+998901112233', courierArrivementDate: '2026-09-08T10:12:00.000Z' } },
    uzum: { version: 1, revision: 1, notification: { pending: true } }, ...extra };
}

test('Uzum card shows what Uzum sends about the courier, payment and comment, in plain words', () => {
  const { render, keyboard } = require('../src/uzum/notifications');
  const fresh = render(uzumRow(), at);
  assert.match(fresh, /^🛵 <b>Заказ Uzum Tezkor 251111-123456<\/b>\nСтатус: 🆕 Новый — ждёт решения\nBillz: товар ещё не списан\n/);
  assert.match(fresh, /⏰ Принять до: <b>15:15<\/b>/);
  assert.match(fresh, /🕒 Курьер приедет: <b>15:12<\/b>/);
  assert.match(fresh, /📞 Связь с курьером: \+998901112233/);
  assert.match(fresh, /👤 Клиент: Akmal\n/);
  assert.match(fresh, /💳 Оплата: картой/);
  assert.match(fresh, /💬 Комментарий: Позвонить &lt;заранее&gt;/);
  assert.match(fresh, /<b>Состав:<\/b>\n• IsoFresh — 1 шт × 350 000 UZS\nИтого: <b>350 000 UZS<\/b>/);
  assert.match(fresh, /👉 Проверьте наличие товара и нажмите «✅ Принять»\.\n<a href="https:\/\/admin\.fairhaven\.uz\/orders">Открыть в панели<\/a>$/);
  // The card is presentation only: the buttons and what they send stay as they were.
  assert.deepEqual(keyboard(uzumRow(), at).inline_keyboard.map(([button]) => button.callback_data), [`uz:a:${id}`, `uz:r:${id}`]);

  const accepted = render(uzumRow({ status: 'reserved', billz: { reservationApplied: true },
    uzum: { version: 1, revision: 2, acceptedAt: new Date('2026-09-08T10:03:00Z') } }), new Date('2026-09-08T10:04:00Z'));
  assert.match(accepted, /Статус: ✅ Принят — соберите заказ\nBillz: товар отложен под заказ/);
  assert.doesNotMatch(accepted, /Принять до|Срок принятия/);
  assert.match(accepted, /🕒 Курьер приедет: <b>15:12<\/b>/);
  assert.match(accepted, /⏱ принят 15:03\n/);
  assert.match(accepted, /👉 Соберите заказ к приезду курьера и нажмите «📦 Готов»\./);

  const sold = render(uzumRow({ status: 'sold', uzum: { version: 1, revision: 3,
    acceptedAt: new Date('2026-09-08T10:03:00Z'), readyAt: new Date('2026-09-08T10:09:00Z') } }), new Date('2026-09-08T10:10:00Z'));
  assert.match(sold, /Статус: 📦 Готов — отдайте курьеру Uzum\nBillz: продано, товар списан/);
  assert.match(sold, /⏱ принят 15:03 · готов 15:09/);
  assert.doesNotMatch(sold, /👉/);

  const late = render(uzumRow(), new Date('2026-09-08T10:16:00Z'));
  assert.match(late, /⌛ Срок принятия истёк/); assert.doesNotMatch(late, /Принять до/);

  const cancelled = render(uzumRow({ status: 'cancelled' }), at);
  assert.match(cancelled, /Статус: ❌ Отменён/);
  assert.doesNotMatch(cancelled, /Курьер приедет|Связь с курьером/);
});

test('Uzum card survives an order with no usable delivery details', () => {
  const { render } = require('../src/uzum/notifications');
  for (const rawIn of [null, undefined, 'text', 7, [], { deliveryInfo: 'soon', paymentInfo: [], comment: { a: 1 } },
    { deliveryInfo: { courierArrivementDate: 'not a date', phoneNumber: 998 }, paymentInfo: { paymentType: 'BARTER' }, comment: '' }]) {
    const text = render(uzumRow({ rawIn }), at);
    assert.match(text, /Заказ Uzum Tezkor 251111-123456/);
    assert.match(text, /Итого: <b>350 000 UZS<\/b>/);
    assert.doesNotMatch(text, /Курьер приедет|Связь с курьером|Оплата|Комментарий|undefined|null|NaN|\[object/);
  }
});

function yandexRow(extra = {}, yandex = {}) {
  return { channel: 'yandex', internalOrderId: id, externalId: '261008-0000001', createdAt: at, updatedAt: at,
    status: 'received', totalAmount: 350000, billz: {}, customer: { name: '', phone: '' },
    items: [{ billzProductId: 'p1', name: 'IsoFresh', quantity: 1, unitPrice: 350000 }],
    yandex: { version: 1, revision: 1, itemsRevision: 1, fulfillmentStatus: 'NEW', audit: [],
      requestSnapshot: { items: [], comment: 'Тестовый заказ\nне передавать курьеру', paymentInfo: { paymentType: 'CASH' },
        deliveryInfo: { clientName: 'Иван', phoneNumber: '+998900000000', courierArrivementDate: '2026-09-08T10:20:00+00:00' } },
      ...yandex }, ...extra };
}

test('Yandex card adds the courier time, payment, comment and the steps Yandex reported', () => {
  const { render } = require('../src/yandex/notifications');
  const fresh = render(yandexRow(), at);
  assert.match(fresh, /Статус: 🆕 Новый — ждёт решения\nBillz: товар ещё не списан\n🕒 Курьер приедет: <b>15:20<\/b>\n👤 Иван, \+998900000000\n💵 Оплата: наличными\n💬 Комментарий: Тестовый заказ не передавать курьеру\n/);
  assert.doesNotMatch(fresh, /⏱/);
  assert.match(fresh, /👉 Проверьте состав/);

  const delivered = render(yandexRow({ status: 'sold' }, { fulfillmentStatus: 'DELIVERED',
    acceptedAt: new Date('2026-09-08T10:02:00Z'), readyAt: new Date('2026-09-08T10:09:00Z'),
    audit: [
      { actor: { type: 'telegram' }, action: 'ready', outcome: 'applied', at: new Date('2026-09-08T10:09:00Z') },
      { actor: { type: 'yandex' }, action: 'TAKEN_BY_COURIER', outcome: 'received', at: new Date('2026-09-08T10:21:00Z') },
      { actor: { type: 'yandex' }, action: 'DELIVERED', outcome: 'received', at: new Date('2026-09-08T10:48:00Z') },
    ] }), new Date('2026-09-08T10:50:00Z'));
  assert.match(delivered, /Статус: 🏁 Доставлен/);
  assert.match(delivered, /⏱ принят 15:02 · готов 15:09 · курьер забрал 15:21 · доставлен 15:48/);
  // Once the courier has the order, when he was due at the shop is no longer news.
  assert.doesNotMatch(delivered, /Курьер приедет/);

  const bare = render(yandexRow({}, { requestSnapshot: { items: [] } }), at);
  assert.doesNotMatch(bare, /Курьер приедет|Оплата|Комментарий|⏱|undefined|null/);
  assert.match(bare, /Итого: <b>350 000 UZS<\/b>/);
});

test('Medicalka request card shows the answer deadline, the address and why a request closed', () => {
  const { renderMedicalkaApproval } = require('../src/notify/telegram');
  const approval = { _id: 'a1', checkoutId: 'chk-1', status: 'pending', subtotal: 42000, deliveryType: 'delivery',
    deadlineAt: new Date('2026-09-08T10:03:00Z'), comment: '',
    deliveryData: { address: { address: 'Toshkent, Amir Temur 1 <uy>', latitude: 41.311081, longitude: 69.240562 }, latitude: 41.311081, longitude: 69.240562 },
    customer: { firstName: '', lastName: '', phone: '' },
    items: [{ name: 'OvaBoost', quantity: 2, lineTotal: 42000 }] };
  assert.equal(renderMedicalkaApproval(approval, at), [
    '🏥 <b>Medicalka zayavka / Заявка</b> · <code>chk-1</code>',
    '⏰ Javob muddati / Ответить до: <b>15:03</b>',
    '',
    '• OvaBoost × 2 — 42 000 UZS',
    '',
    '💰 <b>42 000 UZS</b>',
    '🚚 Yetkazib berish / Доставка',
    '📍 Toshkent, Amir Temur 1 &lt;uy&gt; · <a href="https://yandex.uz/maps/?pt=69.240562,41.311081&amp;z=17&amp;l=map">xarita / карта</a>',
    '',
    '⏳ Tasdiq kutilmoqda / Ожидает решения',
  ].join('\n'));

  const closed = renderMedicalkaApproval({ ...approval, status: 'rejected', deliveryType: 'locker', deliveryData: null,
    comment: 'Auto-rejected: no response within the time limit' }, at);
  assert.doesNotMatch(closed, /Javob muddati|📍/);
  assert.match(closed, /🚚 locker\n\n❌ Rad etildi \/ Отклонено\nℹ️ Auto-rejected: no response within the time limit$/);
});
