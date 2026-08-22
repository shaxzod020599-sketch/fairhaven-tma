const assert = require('node:assert/strict');
const test = require('node:test');

const { startNotificationWorker } = require('../src/medicalka/notificationWorker');

test('notification worker drains immediately and on its own interval', async () => {
  let calls = 0;
  let scheduled;
  let unrefCalls = 0;
  const timer = startNotificationWorker({
    drain: async () => { calls += 1; },
    intervalMs: 5000,
    schedule: (callback, intervalMs) => {
      scheduled = { callback, intervalMs };
      return { unref: () => { unrefCalls += 1; } };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(scheduled.intervalMs, 5000);
  assert.equal(unrefCalls, 1);

  scheduled.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.ok(timer);
});

test('notification worker survives a failed drain', async () => {
  let calls = 0;
  let scheduled;
  startNotificationWorker({
    drain: async () => {
      calls += 1;
      if (calls === 1) throw new Error('telegram unavailable');
    },
    intervalMs: 5000,
    schedule: (callback) => {
      scheduled = callback;
      return {};
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  scheduled();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});
