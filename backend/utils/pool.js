/**
 * Bounded-concurrency worker pool with a global start rate.
 *
 * Replaces the chunk-then-sleep shape used for broadcasts. With chunks, one
 * slow recipient held up the whole batch: every task in a chunk waited for the
 * slowest, and a retrying send can take tens of seconds. Here a finished worker
 * immediately picks up the next item, so throughput is set by the rate limit
 * rather than by the worst recipient in each group of 25.
 *
 * `minIntervalMs` spaces task *starts*, which is what an API rate limit
 * actually counts. Concurrency separately bounds how many are in flight, so a
 * pile-up of slow requests cannot grow without limit.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, options, worker) {
  const list = Array.from(items);
  const concurrency = Math.max(1, options.concurrency || 1);
  const minIntervalMs = Math.max(0, options.minIntervalMs || 0);
  const shouldStop = options.shouldStop || (() => false);

  const results = new Array(list.length);
  let cursor = 0;
  let nextSlotAt = 0;

  /**
   * Reserves the next send slot and returns how long to wait for it.
   *
   * Fully synchronous on purpose. Reading a timestamp, awaiting, then writing
   * it back lets every idle worker observe the same stale value and start at
   * once — the pacing then does nothing on the first burst, which is exactly
   * what the limit exists to prevent. Because JavaScript runs this function to
   * completion before any other worker resumes, the reservation cannot race.
   */
  function reserveSlot() {
    const now = Date.now();
    const at = Math.max(now, nextSlotAt);
    nextSlotAt = at + minIntervalMs;
    return at - now;
  }

  async function claim() {
    for (;;) {
      if (shouldStop()) return;
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;

      if (minIntervalMs) {
        const wait = reserveSlot();
        if (wait > 0) await sleep(wait);
      }

      try {
        results[index] = { status: 'fulfilled', value: await worker(list[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, () => claim())
  );

  return results;
}

module.exports = { mapWithConcurrency, sleep };
