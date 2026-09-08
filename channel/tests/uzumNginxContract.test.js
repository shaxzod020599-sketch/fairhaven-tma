const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { schema } = require('./uzumSchema');

// Static contract inspection, not an nginx runtime emulator. Tokenize quoted
// return bodies intact so JSON braces cannot be confused with location blocks.
const source = fs.readFileSync(path.join(__dirname, '../../deploy/nginx/api.fairhaven.uz'), 'utf8');
const roots = [];
const stack = [roots];
let words = [];
for (const token of source.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|[{};]|[^\s{};#"']+/g)) {
  if (token.startsWith('#')) continue;
  if (token === '}') { assert.equal(words.length, 0); stack.pop(); continue; }
  if (token === ';' || token === '{') {
    const entry = { name: words[0], args: words.slice(1), children: [] };
    stack.at(-1).push(entry);
    if (token === '{') stack.push(entry.children);
    words = [];
  } else words.push(/^['"]/.test(token) ? token.slice(1, -1).replace(/\\n/g, '\n') : token);
}
assert.equal(stack.length, 1);
assert.equal(words.length, 0);
const directive = (block, name) => block.children.find((entry) => entry.name === name);
const server = roots.find((entry) => entry.name === 'server'
  && entry.children.some((child) => child.name === 'listen' && child.args.includes('443')));
const locations = server.children.filter((entry) => entry.name === 'location');
function locationFor(uri) {
  return locations.find((entry) => entry.args[0] === '=' && entry.args[1] === uri)
    || locations.filter((entry) => entry.args[0] === '^~' && uri.startsWith(entry.args[1]))
      .sort((a, b) => b.args[1].length - a.args[1].length)[0]
    || locations.find((entry) => entry.args[0] === '/');
}
function rateResponse(location) {
  const errorPage = directive(location, 'error_page') || directive(server, 'error_page');
  assert.deepEqual(errorPage.args.slice(0, 2), ['429', '=']);
  const handler = locations.find((entry) => entry.args[0] === errorPage.args[2]);
  assert.ok(handler, 'the configured rate-limit handler must exist');
  assert.equal(directive(handler, 'default_type').args[0], 'application/json');
  const reply = directive(handler, 'return');
  return { status: Number(reply.args[0]), body: JSON.parse(reply.args[1]) };
}

for (const uri of ['/uzum', '/uzum/security/oauth/token', '/uzum/v1/order/test/status']) {
  test(`nginx rate-limit response configured for ${uri} conforms to ErrorListV1`, () => {
    const location = locationFor(uri);
    assert.equal(directive(location, 'include').args[0], 'snippets/fairhaven-api-proxy.conf');
    const response = rateResponse(location);
    assert.equal(response.status, 429);
    schema('ErrorListV1', response.body);
    assert.equal(response.body[0].code, 429);
  });
}

test('Medicalka and the server default retain their existing rate-limit envelope', () => {
  for (const location of [server, locationFor('/medicalka/v1'), locationFor('/medicalka/v1/orders')]) {
    assert.deepEqual(rateResponse(location), { status: 429, body: { error: 'rate_limited' } });
  }
});

test('private hub paths still select the unproxied JSON 404', () => {
  for (const uri of ['/internal', '/internal/orders', '/health', '/health/detail', '/uzum-private']) {
    const location = locationFor(uri);
    assert.equal(directive(location, 'include'), undefined);
    assert.equal(directive(location, 'proxy_pass'), undefined);
    const reply = directive(location, 'return');
    assert.equal(reply.args[0], '404');
    assert.deepEqual(JSON.parse(reply.args[1]), { error: 'not_found' });
  }
});
