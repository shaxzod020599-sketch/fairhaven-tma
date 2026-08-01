const assert = require('node:assert/strict');
const test = require('node:test');
const { mapWithConcurrency } = require('../utils/pool');

test('results keep input order regardless of completion order', async () => {
  const results = await mapWithConcurrency(
    [30, 5, 15],
    { concurrency: 3 },
    async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    }
  );

  assert.deepEqual(results.map((r) => r.value), [30, 5, 15]);
});

test('a rejection is captured per item, not thrown', async () => {
  const results = await mapWithConcurrency(
    ['ok', 'boom', 'ok'],
    { concurrency: 2 },
    async (item) => {
      if (item === 'boom') throw new Error('failed');
      return item;
    }
  );

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /failed/);
  // One failure must not abandon the rest of the run.
  assert.equal(results[2].status, 'fulfilled');
});

test('concurrency is capped', async () => {
  let inFlight = 0;
  let peak = 0;

  await mapWithConcurrency(
    Array.from({ length: 20 }, (_, i) => i),
    { concurrency: 4 },
    async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    }
  );

  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded the cap`);
  assert.ok(peak > 1, 'work should actually overlap');
});

test('the start rate holds even when every worker is idle at once', async () => {
  // The failure this guards: reading the last-start timestamp, awaiting, then
  // writing it back lets all idle workers observe the same stale value and
  // start together, so the very first burst ignores the limit entirely.
  const startedAt = [];

  await mapWithConcurrency(
    Array.from({ length: 8 }, (_, i) => i),
    { concurrency: 8, minIntervalMs: 25 },
    async () => { startedAt.push(Date.now()); }
  );

  // Asserted over the whole span, not gap by gap. Slots are reserved at
  // absolute times, so a timer that wakes late compresses the gap after it
  // while keeping the average rate — which is the property a rate limit
  // actually needs, and the only one that holds on a loaded machine.
  const span = startedAt[startedAt.length - 1] - startedAt[0];
  assert.ok(span >= 140, `8 starts spanned only ${span}ms, expected ~175ms`);
});

test('shouldStop halts the run without rejecting', async () => {
  let processed = 0;
  const results = await mapWithConcurrency(
    Array.from({ length: 50 }, (_, i) => i),
    { concurrency: 2, shouldStop: () => processed >= 5 },
    async () => { processed += 1; }
  );

  assert.ok(processed < 50, 'should have stopped early');
  assert.equal(results.filter(Boolean).length, processed);
});

test('an empty list resolves immediately', async () => {
  assert.deepEqual(await mapWithConcurrency([], { concurrency: 4 }, async () => 1), []);
});
