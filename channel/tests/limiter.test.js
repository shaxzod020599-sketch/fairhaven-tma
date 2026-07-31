const assert = require('node:assert/strict');
const test = require('node:test');
const { createLimiter } = require('../src/billz/limiter');

test('spaces requests by the configured minimum gap', async () => {
  const limiter = createLimiter({ requestsPerSecond: 50 }); // 20ms apart
  const startedAt = [];

  await Promise.all([1, 2, 3].map(() =>
    limiter.schedule(async () => { startedAt.push(Date.now()); })
  ));

  assert.equal(startedAt.length, 3);
  // Allow a little scheduler slack, but the gap must clearly exist.
  assert.ok(startedAt[1] - startedAt[0] >= 15, `gap 1 was ${startedAt[1] - startedAt[0]}ms`);
  assert.ok(startedAt[2] - startedAt[1] >= 15, `gap 2 was ${startedAt[2] - startedAt[1]}ms`);
});

test('runs tasks one at a time rather than in parallel', async () => {
  const limiter = createLimiter({ requestsPerSecond: 1000 });
  let active = 0;
  let maxActive = 0;

  await Promise.all(Array.from({ length: 5 }, () =>
    limiter.schedule(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    })
  ));

  assert.equal(maxActive, 1);
});

test('a rejected task does not break the queue for later callers', async () => {
  const limiter = createLimiter({ requestsPerSecond: 1000 });

  await assert.rejects(
    limiter.schedule(async () => { throw new Error('boom'); }),
    /boom/
  );

  const result = await limiter.schedule(async () => 'still working');
  assert.equal(result, 'still working');
});

test('rejects a non-positive rate', () => {
  assert.throws(() => createLimiter({ requestsPerSecond: 0 }), /must be > 0/);
});
