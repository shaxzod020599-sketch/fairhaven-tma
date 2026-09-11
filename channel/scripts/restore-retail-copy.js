'use strict';
// One-off operator transport. Never prints or persists plaintext input.
const config = require('../src/config');
async function restore(bundle, request) {
  const clientId = bundle?.clientId;
  const clientSecret = bundle?.clientSecret;
  const place = bundle?.place;
  if (clientId !== 'fhu_id_99be68fa7282def81d6c87ce' || typeof clientSecret !== 'string'
    || clientSecret.length < 8 || clientSecret.length > 4096
    || place !== '6d2c8ecc-e818-4812-9b34-146c6f312f56') throw new Error('invalid_bundle');
  const metadata = await request('GET', '', undefined);
  const keys = metadata.channels.find(c => c.channel === 'uzum')?.keys.filter(k => k.clientId === clientId) || [];
  if (keys.length !== 1 || (metadata.place && metadata.place !== place)) throw new Error('target_mismatch');
  await request('PUT', `/${keys[0].id}/secret`, { clientSecret });
  if (!metadata.place) await request('PUT', '/place', { place });
  const after = await request('GET', '', undefined);
  if (after.place !== place || !after.channels.find(c => c.channel === 'uzum')?.keys.some(k => k.id === keys[0].id && k.secretAvailable)) throw new Error('not_confirmed');
}
if (require.main === module) {
  (async () => {
    let raw = '';
    for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 16384) throw new Error(); }
    const bundle = JSON.parse(raw); raw = '';
    await restore(bundle, async (method, path, body) => {
      const res = await fetch(`http://127.0.0.1:${config.port}/internal/connections${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'X-Internal-Token': config.internalToken, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error();
      return res.json();
    });
    console.log('restore_complete');
  })().catch(() => { console.error('restore_not_confirmed'); process.exitCode = 1; });
}
module.exports = { restore };
