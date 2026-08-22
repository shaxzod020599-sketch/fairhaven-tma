function startNotificationWorker({
  drain,
  intervalMs,
  schedule = setInterval,
} = {}) {
  const run = () => Promise.resolve().then(drain).catch(() => {});
  run();
  const timer = schedule(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = { startNotificationWorker };
