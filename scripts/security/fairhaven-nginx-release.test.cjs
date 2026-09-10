const test = require('node:test');
const assert = require('node:assert/strict');
const { execute } = require('./fairhaven-nginx-release.cjs');
test('CLI suppresses arbitrary remote output and explicitly disables PTY', () => {
  const fs = require('node:fs'); const vm = require('node:vm');
  const output = []; let argv;
  const module = { exports: {} };
  const requireFake = () => ({ spawnSync: (_bin, args) => { argv = args; return { status: 0, stdout: 'UNTRUSTED_REMOTE_OUTPUT', stderr: 'UNTRUSTED_REMOTE_ERROR' }; } });
  requireFake.main = module;
  vm.runInNewContext(fs.readFileSync(require.resolve('./fairhaven-nginx-release.cjs'), 'utf8'), {
    require: requireFake, module, process: { argv: ['node', 'helper', 'check'], env: { HOME: '/synthetic/home', SUDO_PASSWORD: 'synthetic' }, stdout: { write: s => output.push(s) } },
    console: { log: s => output.push(s), error: s => output.push(s) },
  });
  assert.equal(output.join('\n').includes('UNTRUSTED'), false);
  assert.ok(argv.includes('-T'));
});
test('password goes only to stdin of fixed SSH command', () => {
  let observed;
  const password = 'SYNTHETIC-PASSWORD-only';
  execute('check', { password, env: { HOME: '/synthetic/home', SUDO_PASSWORD: password, OTHER_TOKEN: 'absent' },
    spawn: (...args) => { observed = args; return { status: 0 }; } });
  const [binary, argv, options] = observed;
  assert.equal(binary, '/usr/bin/ssh');
  assert.equal(argv.at(-1), "sudo -S -p '' /usr/sbin/nginx -t");
  assert.equal(argv.some(arg => arg.includes(password)), false);
  assert.equal(options.input, `${password}\n`);
  assert.equal(options.env.SUDO_PASSWORD, undefined);
  assert.equal(options.env.OTHER_TOKEN, undefined);
  assert.equal(options.env.HOME, '/synthetic/home');
});
test('unknown operations and multiline credentials never spawn', () => {
  for (const [mode, password] of [['anything', 'synthetic'], ['check', 'line\nline'], ['check', '']]) {
    assert.throws(() => execute(mode, { password, spawn: () => assert.fail('must not spawn') }));
  }
});
