const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const Ajv = require('ajv');
const spec = YAML.parse(fs.readFileSync(path.join(__dirname, 'fixtures/uzum/Uzum-Tezkor-Grocery-API.yml'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
require('ajv-formats')(ajv);
ajv.addSchema({ $id: 'uzum', components: spec.components });
function schema(name, body) {
  const validate = ajv.compile({ $ref: `uzum#/components/schemas/${name}` });
  assert.ok(validate(body), JSON.stringify(validate.errors));
}
function response(route, method, res) {
  const responses = spec.paths[route][method.toLowerCase()].responses;
  const expected = responses[String(res.status)] || responses.default;
  assert.ok(expected, `undocumented response status ${res.status}`);
  const type = (res.type || '').split(';')[0];
  if (expected.content && Object.keys(expected.content).length === 0) {
    assert.ok(res.body === null || res.body === '', 'response must have no body');
    if (Object.hasOwn(res, 'raw')) assert.equal(res.raw, '', 'response must contain zero bytes');
    assert.equal(type, '', 'empty response must not advertise a media type');
    return;
  }
  assert.ok(expected.content[type], `undocumented response media type ${type}`);
  const validate = ajv.compile({ ...expected.content[type].schema, components: spec.components });
  assert.ok(validate(res.body), JSON.stringify(validate.errors));
}
module.exports = { schema, response };
