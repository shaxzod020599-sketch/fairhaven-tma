/**
 * Serialising rate limiter.
 *
 * Billz allows 2 requests/second per IP and runs a heuristic analyser that can
 * block an address it considers bursty, so requests are issued one at a time
 * with a guaranteed minimum gap rather than in parallel bursts. Everything that
 * talks to Billz — sync, order writes, admin "sync now" — shares one instance,
 * which is what keeps the process as a whole under the ceiling.
 */
function createLimiter({ requestsPerSecond }) {
  if (!(requestsPerSecond > 0)) throw new Error('requestsPerSecond must be > 0');
  const minGapMs = 1000 / requestsPerSecond;

  let chain = Promise.resolve();
  let lastStartedAt = 0;
  let queued = 0;

  function schedule(task) {
    queued += 1;
    const run = chain.then(async () => {
      const wait = Math.max(0, lastStartedAt + minGapMs - Date.now());
      if (wait > 0) await sleep(wait);
      lastStartedAt = Date.now();
      try {
        return await task();
      } finally {
        queued -= 1;
      }
    });
    // Keep the chain alive even when a task rejects, otherwise one failure
    // would permanently break scheduling for every later caller.
    chain = run.then(noop, noop);
    return run;
  }

  return {
    schedule,
    get pending() { return queued; },
    get minGapMs() { return minGapMs; },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function noop() {}

module.exports = { createLimiter, sleep };
