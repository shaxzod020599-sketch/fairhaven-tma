const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm');
test('vault bundle travels only on SSH stdin; arbitrary remote output is discarded', () => {
  const output = []; let seen;
  const bundle = JSON.stringify({ clientId: 'synthetic', clientSecret: 'SYNTHETIC-SECRET', place: 'store' });
  const filename = require('node:path').join(__dirname, 'restore-retail-copy.cjs');
  assert.ok(fs.existsSync(filename), 'secure transport must exist');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => { assert.equal(name, 'node:child_process'); return { spawnSync: (...args) => { seen = args; return { status: 0, stdout: 'UNTRUSTED', stderr: bundle }; } }; },
    process: { env: { HOME: '/synthetic', UZUM_CONNECTION_JSON: bundle }, exitCode: 0 },
    console: { log: s => output.push(s), error: s => output.push(s) },
  });
  assert.equal(seen[2].input, bundle); assert.ok(seen[1].includes('-T'));
  assert.equal(JSON.stringify(seen[1]).includes('SYNTHETIC-SECRET'), false);
  assert.equal(seen[2].env.UZUM_CONNECTION_JSON, undefined);
  assert.equal(output.join('').includes('UNTRUSTED'), false); assert.equal(output.join('').includes('SYNTHETIC'), false);
});
