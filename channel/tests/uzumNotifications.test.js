const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryModel } = require('./helpers/uzumMemoryModel');
const { createNotifier, render, keyboard } = require('../src/uzum/notifications');
const id = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-09-08T10:00:00Z');
function fixture() {
  const row = { _id: 'row', channel: 'uzum', internalOrderId: id, externalId: 'eats', createdAt: at,
    status: 'received', items: [], billz: {}, uzum: { version: 1, revision: 1, notification: { pending: true } } };
  const Model = memoryModel([row]); const calls = []; let fail = true;
  const notifier = createNotifier({ Model, AdminModel: memoryModel([{ role: 'admin', telegramId: 77 }, { role: 'user', telegramId: 88 }]),
    channelId: '-100', enabled: () => true, now: () => at,
    send: async (method, payload) => { calls.push({ method, payload }); return fail && payload.chat_id === '-100' ? null : { message_id: 5 }; } });
  return { row, Model, notifier, calls, succeed() { fail = false; } };
}
test('notification partial failure stays pending; retry skips delivered admin and sends only configured channel', async () => {
  const f = fixture(); await f.notifier.deliver(f.row);
  assert.equal(f.row.uzum.notification.pending, true);
  assert.equal(f.row.uzum.notification.messages.length, 1);
  assert.deepEqual(f.calls.map((c) => c.payload.chat_id), ['77', '-100']);
  f.succeed(); await f.notifier.deliver(f.row);
  assert.equal(f.row.uzum.notification.pending, false);
  assert.deepEqual(f.calls.map((c) => c.payload.chat_id), ['77', '-100', '-100']);
});
test('final status edits every tracked card and clears keyboard, failed edit remains pending', async () => {
  const f = fixture(); f.succeed(); await f.notifier.deliver(f.row);
  f.row.status = 'sold'; f.row.soldAt = at; f.row.uzum.revision += 1;
  await f.notifier.deliver(f.row);
  const edits = f.calls.filter((c) => c.method === 'editMessageText');
  assert.equal(edits.length, 2);
  for (const call of edits) assert.deepEqual(call.payload.reply_markup.inline_keyboard, []);
  assert.ok(edits[0].payload.text.includes('READY'));
});
test('disabled notifier sends nothing and Unicode hostile long cards stay bounded and escaped', async () => {
  const f = fixture();
  const disabled = createNotifier({ Model: f.Model, enabled: () => false, send: async () => { throw new Error('must not send'); } });
  await disabled.deliver(f.row);
  f.row.items = Array.from({ length: 200 }, () => ({ name: '<>&😀'.repeat(1000), quantity: 1, unitPrice: 1 }));
  const text = render(f.row, at);
  assert.equal(text.includes('<>'), false); assert.ok(text.includes('&lt;'));
  assert.ok(text.replace(/&lt;|&gt;|&amp;/g, 'x').length < 4000);
  assert.equal(text.isWellFormed(), true);
  assert.equal(JSON.stringify(keyboard({ ...f.row, status: 'reserved' }, at)).includes('uz:ready'), false);
});

test('demoted recipients receive keyboard cleanup only, never current order content', async () => {
  const f = fixture(); f.succeed(); await f.notifier.deliver(f.row);
  const calls = [];
  const notifier = createNotifier({ Model: f.Model, AdminModel: memoryModel([]), channelId: '-100', enabled: () => true, now: () => at,
    send: async (method, payload) => { calls.push({ method, payload }); return { message_id: 5 }; } });
  f.row.status = 'sold'; f.row.soldAt = at; f.row.uzum.revision += 1;
  await notifier.deliver(f.row);
  const demoted = calls.find((c) => c.payload.chat_id === '77');
  assert.equal(demoted.method, 'editMessageReplyMarkup'); assert.equal(demoted.payload.text, undefined);
  assert.equal(f.row.uzum.notification.messages.some((message) => message.chatId === '77'), false);
});
