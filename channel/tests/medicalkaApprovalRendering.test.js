const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/medicalka-rendering-unused';
const { renderMedicalkaApproval } = require('../src/notify/telegram');

const approval = (over = {}) => ({
  checkoutId: 'checkout-a', status: 'pending', requiresAction: true,
  checkoutActive: true, deadlineAt: new Date('2026-08-22T03:03:00Z'),
  ...over,
});

test('approval text shows the response deadline with an explicit Tashkent offset', () => {
  assert.match(renderMedicalkaApproval(approval()), /08:03:00.*UTC\+05:00/);
  assert.doesNotMatch(renderMedicalkaApproval(approval({ deadlineAt: 'invalid' })), /Invalid Date/);
});

test('automatic rejection explains the upstream response timeout', () => {
  const rendered = renderMedicalkaApproval(approval({
    status: 'rejected', requiresAction: false,
    comment: 'Auto-rejected: no response within the time limit',
  }));
  assert.match(rendered, /Автоматически отклонено.*[Вв]ремя ответа/);
});

test('closure comments are bounded before HTML escaping', () => {
  const rendered = renderMedicalkaApproval(approval({
    status: 'rejected', requiresAction: false, comment: '<bad>&' + 'x'.repeat(5000),
  }));
  assert.match(rendered, /&lt;bad&gt;&amp;/);
  assert.doesNotMatch(rendered, /<bad>/);
  assert.ok(rendered.length < 4096);
});

test('expired inactive approval explains expiry without declaring active or accepted rows expired', () => {
  assert.match(renderMedicalkaApproval(approval({ requiresAction: false })), /[Вв]ремя ответа истекло/);
  assert.doesNotMatch(renderMedicalkaApproval(approval()), /[Вв]ремя ответа истекло/);
  assert.doesNotMatch(renderMedicalkaApproval(approval({ status: 'accepted', requiresAction: false })), /[Вв]ремя ответа истекло/);
});

function parsedCard(html) {
  const stack = [];
  for (const match of html.matchAll(/<([^>]+)>/g)) {
    const tag = match[1];
    assert.ok(['b', '/b', 'code', '/code'].includes(tag), `unexpected HTML tag: ${tag}`);
    if (tag.startsWith('/')) assert.equal(stack.pop(), tag.slice(1));
    else stack.push(tag);
  }
  assert.deepEqual(stack, []);
  const text = html.replace(/<\/?(?:b|code)>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.ok(text.isWellFormed(), 'card contains an unpaired surrogate');
  assert.ok(text.length <= 4096, `parsed UTF-16 length ${text.length} exceeds 4096`);
  return text;
}

for (const [nameLength, status] of [[178, 'pending'], [174, 'rejected']]) {
  test(`20 items with ${nameLength}-character names fit a ${status} Telegram card`, () => {
    const text = parsedCard(renderMedicalkaApproval(approval({
      status, requiresAction: status === 'pending',
      comment: status === 'rejected' ? 'Auto-rejected: no response within the time limit' : '',
      items: Array.from({ length: 20 }, () => ({ name: 'x'.repeat(nameLength), quantity: 1, lineTotal: 15000 })),
    })));
    assert.match(text, /checkout-a/);
    assert.match(text, /08:03:00.*UTC\+05:00/);
    assert.match(text, /….*[Аа]дмин/);
    assert.match(text, status === 'pending' ? /Ожидает решения/ : /Автоматически отклонено/);
  });
}

test('huge HTML and emoji fields remain valid, bounded, visibly truncated, and leave source intact', () => {
  const huge = '<b>&😀'.repeat(10000);
  const input = approval({
    checkoutId: `checkout-${huge}`, status: 'rejected', requiresAction: false,
    comment: `reason-${huge}`, customer: { firstName: huge, lastName: huge, phone: huge },
    decision: { actorName: huge }, deliveryType: huge,
    items: [{ name: huge, quantity: 1, lineTotal: 15000 }],
  });
  const before = structuredClone(input);
  const html = renderMedicalkaApproval(input);
  const text = parsedCard(html);
  assert.match(html, /&lt;b&gt;&amp;😀/);
  assert.match(text, /checkout-/);
  assert.match(text, /reason-/);
  assert.match(text, /Отклонено/);
  assert.match(text, /UTC\+05:00/);
  assert.match(text, /….*[Аа]дмин/);
  assert.deepEqual(input, before);
});

test('truncation never splits emoji at checkout, item, or comment boundaries', () => {
  const text = parsedCard(renderMedicalkaApproval(approval({
    checkoutId: '😀'.repeat(1000), status: 'rejected', requiresAction: false,
    comment: '😀'.repeat(1000), items: [{ name: '😀'.repeat(4000), quantity: 1 }],
  })));
  assert.match(text, /….*[Аа]дмин/);
});
