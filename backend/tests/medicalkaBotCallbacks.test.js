const assert = require('node:assert/strict');
const test = require('node:test');

const { registerMedicalkaActions } = require('../bot/bot');

const ID = '507f1f77bcf86cd799439011';

function registered(actionService) {
  let pattern;
  let handler;
  registerMedicalkaActions({
    action(nextPattern, nextHandler) { pattern = nextPattern; handler = nextHandler; },
  }, { actionService });
  return { pattern, handler };
}

function context(data) {
  const events = [];
  return {
    from: { id: 77 },
    match: data.match(/^ma:(a|r|rc|x):([a-f\d]{24})$/i),
    answerCbQuery: async (text) => events.push(['answer', text]),
    editMessageReplyMarkup: async (markup) => events.push(['markup', markup]),
    events,
  };
}

test('reject tap requires a second confirmed callback', async () => {
  let writes = 0;
  const { handler } = registered({
    canAct: async () => true,
    respond: async () => { writes += 1; return { ok: true }; },
  });
  const ctx = context(`ma:r:${ID}`);

  await handler(ctx);

  assert.equal(writes, 0);
  const markup = ctx.events.find(([kind]) => kind === 'markup')[1];
  assert.equal(markup.inline_keyboard[0][0].callback_data, `ma:rc:${ID}`);
});

test('each callback refuses a user without current admin role', async () => {
  let writes = 0;
  const { handler } = registered({
    canAct: async () => false,
    respond: async () => { writes += 1; return { ok: true }; },
  });
  const ctx = context(`ma:a:${ID}`);

  await handler(ctx);

  assert.equal(writes, 0);
  assert.match(ctx.events.find(([kind]) => kind === 'answer')[1], /Доступ|Ruxsat/);
});

test('confirmed accept and reject use one action service and strip stale buttons', async () => {
  const decisions = [];
  const { handler } = registered({
    canAct: async () => true,
    respond: async (decision) => {
      decisions.push(decision);
      return { ok: true, approval: { status: decision.action } };
    },
  });
  const accept = context(`ma:a:${ID}`);
  const reject = context(`ma:rc:${ID}`);

  await handler(accept);
  await handler(reject);

  assert.deepEqual(decisions.map((row) => row.action), ['accepted', 'rejected']);
  assert.ok([accept, reject].every((ctx) => (
    ctx.events.some(([kind, value]) => kind === 'markup' && value.inline_keyboard.length === 0)
  )));
});

test('cancel restores original decision buttons without a write', async () => {
  let writes = 0;
  const { handler } = registered({
    canAct: async () => true,
    respond: async () => { writes += 1; return { ok: true }; },
  });
  const ctx = context(`ma:x:${ID}`);

  await handler(ctx);

  assert.equal(writes, 0);
  const markup = ctx.events.find(([kind]) => kind === 'markup')[1];
  assert.deepEqual(markup.inline_keyboard.flat().map((button) => button.callback_data), [
    `ma:a:${ID}`, `ma:r:${ID}`,
  ]);
});
