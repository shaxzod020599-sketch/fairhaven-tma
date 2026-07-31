/**
 * Issues an API key for a sales channel.
 *
 *   node scripts/issue-key.js medicalka token  --label "Medicalka prod"
 *   node scripts/issue-key.js medicalka secret --label "Medicalka prod"
 *   node scripts/issue-key.js --list
 *   node scripts/issue-key.js --revoke <prefix>_<last4>
 *
 * The key is printed once and never stored in plaintext, so there is no way to
 * recover it later — reissue instead. Rotation is safe: issuing a new key does
 * not revoke the old one, so the channel can switch over before you revoke.
 */
const db = require('../src/db');
const logger = require('../src/logger');
const ChannelKey = require('../src/models/ChannelKey');
const { generateKey, hashKey, describeKey, CHANNEL_TAG, KIND_TAG } = require('../src/models/ChannelKey');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function list() {
  const keys = await ChannelKey().find({}).sort({ createdAt: -1 }).lean();
  if (!keys.length) {
    console.log('No keys issued yet.');
    return;
  }
  console.log('channel    kind    key            active  last used            label');
  for (const k of keys) {
    console.log(
      [
        k.channel.padEnd(10),
        k.kind.padEnd(7),
        `${k.prefix}…${k.last4}`.padEnd(14),
        String(k.active).padEnd(7),
        (k.lastUsedAt ? new Date(k.lastUsedAt).toISOString().slice(0, 19) : 'never').padEnd(20),
        k.label || '',
      ].join(' ')
    );
  }
}

async function revoke(identifier) {
  const [prefix, last4] = String(identifier).split('_').length >= 3
    ? [identifier.split('…')[0], identifier.split('…')[1]]
    : [null, null];
  const query = prefix && last4 ? { prefix, last4 } : { last4: identifier };
  const result = await ChannelKey().updateMany(
    { ...query, active: true },
    { $set: { active: false, revokedAt: new Date() } }
  );
  console.log(`Revoked ${result.modifiedCount} key(s).`);
}

async function issue(channel, kind, label) {
  if (!CHANNEL_TAG[channel]) {
    throw new Error(`channel must be one of: ${Object.keys(CHANNEL_TAG).join(', ')}`);
  }
  if (!KIND_TAG[kind]) {
    throw new Error(`kind must be one of: ${Object.keys(KIND_TAG).join(', ')}`);
  }

  const key = generateKey(channel, kind);
  const shape = describeKey(key);
  await ChannelKey().create({
    channel,
    kind,
    hash: hashKey(key),
    prefix: shape.prefix,
    last4: shape.last4,
    label: label || '',
    active: true,
  });

  console.log('');
  console.log(`  channel : ${channel}`);
  console.log(`  kind    : ${kind}   (${kind === 'token' ? 'read catalogue and stock' : 'submit and update orders'})`);
  console.log(`  key     : ${key}`);
  console.log('');
  console.log('  Shown once. Only its SHA-256 is stored — reissue if lost.');
  console.log('');
}

async function main() {
  await db.connect();
  try {
    if (process.argv.includes('--list')) return await list();

    const revokeTarget = arg('--revoke');
    if (revokeTarget) return await revoke(revokeTarget);

    const [, , channel, kind] = process.argv;
    if (!channel || !kind) {
      console.log('usage: node scripts/issue-key.js <channel> <token|secret> [--label "..."]');
      console.log('       node scripts/issue-key.js --list');
      console.log('       node scripts/issue-key.js --revoke <prefix>…<last4>');
      process.exitCode = 1;
      return;
    }
    return await issue(channel, kind, arg('--label'));
  } finally {
    await db.disconnect();
  }
}

main().catch((err) => {
  logger.error('issue-key failed', { err });
  process.exit(1);
});
