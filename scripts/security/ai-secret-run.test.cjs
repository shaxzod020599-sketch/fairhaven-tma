// Explicit Mac helper verification, outside application suites. No vault access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const helper = '/Users/tm/.ai/bin/ai-secret';
function run(mode, name = 'SYNTHETIC_VALUE', exitCode = 0) {
  const source = fs.readFileSync(helper, 'utf8');
  const start = source.indexOf('# ---------- commands ----------');
  const end = source.indexOf('# git without the token');
  assert.ok(start > 0 && end > start);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-vault-run-'));
  const value = 'NOT_A_REAL_SECRET__quotes"\\$()\nsecond=line\n';
  try {
    // An accidental external env hop must fail before running the destination.
    fs.writeFileSync(path.join(root, 'env'), '#!/bin/bash\nexit 86\n', { mode: 0o700 });
    const probe = path.join(root, 'probe.cjs');
    fs.writeFileSync(probe, `if (process.env.SYNTHETIC_VALUE !== process.env.TEST_VALUE || process.argv.slice(2).join('|') !== 'argument with space|--literal') process.exit(87); process.exit(Number(process.env.TEST_EXIT));`);
    const script = `set -euo pipefail\n${source.slice(start, end)}\n
die() { printf '%s\\n' "$*" >&2; exit 1; }
need_deps() { :; }
manifest_lookup() { printf fixture; }
collect_env() { ENV_ARGS=("$TEST_NAME=$TEST_VALUE"); }
cmd_${mode} ${mode === 'run' ? 'fixture' : ''} -- "$TEST_NODE" "$TEST_PROBE" 'argument with space' --literal
`;
    return spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
      env: { PATH: `${root}:/usr/bin:/bin`, TEST_NODE: process.execPath, TEST_PROBE: probe,
        TEST_NAME: name, TEST_VALUE: value, TEST_EXIT: String(exitCode) },
      encoding: 'utf8', timeout: 5000,
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
for (const mode of ['run', 'auto']) {
  test(`${mode} exports exact multiline values without external env argv`, () => {
    const result = run(mode);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  });
  test(`${mode} preserves destination exit status`, () => assert.equal(run(mode, 'SYNTHETIC_VALUE', 42).status, 42));
  test(`${mode} rejects invalid environment names without echoing values`, () => {
    const result = run(mode, 'INVALID.NAME');
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes('NOT_A_REAL_SECRET'), false);
  });
}
