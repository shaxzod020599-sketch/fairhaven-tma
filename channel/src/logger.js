/**
 * Minimal structured logger.
 *
 * Deliberately dependency-free and deliberately paranoid about secrets: this
 * service holds the Billz integration key and, later, the channel API keys.
 * Anything that looks like a token is masked before it can reach a log file.
 */

const SECRET_KEYS = /^(.*(token|secret|password|authorization|apikey|api_key).*)$/i;

function maskValue(value) {
  if (typeof value !== 'string') return '[redacted]';
  if (value.length <= 8) return '[redacted]';
  return `${value.slice(0, 4)}…${value.length}chars`;
}

function redact(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code };
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? maskValue(v) : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level, message, fields) {
  const line = {
    at: new Date().toISOString(),
    level,
    msg: message,
    ...(fields ? redact(fields) : {}),
  };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(line)}\n`);
}

module.exports = {
  debug: (msg, fields) => { if (process.env.LOG_LEVEL === 'debug') emit('debug', msg, fields); },
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
  redact,
};
