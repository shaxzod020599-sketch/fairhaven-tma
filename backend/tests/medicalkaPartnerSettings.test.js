const assert = require('node:assert/strict');
const test = require('node:test');

const hub = require('../utils/channelHub');
const audit = require('../services/adminAudit');
const controller = require('../controllers/medicalkaController');

const ADMIN = { telegramId: 77, firstName: 'Ali', lastName: 'Admin' };

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('partner summary forwards safe masked data only', async () => {
  const original = hub.requestInternal;
  hub.requestInternal = async (...args) => ({
    ok: true,
    body: {
      activeEnvironment: 'staging',
      profiles: [{
        environment: 'staging', username: 'fa••••ng', passwordConfigured: true,
        processingMode: 'observe', pharmacyCount: 1,
      }],
    },
    args,
  });
  try {
    const res = response();
    await controller.partnerSummary({ admin: ADMIN }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.activeEnvironment, 'staging');
    assert.doesNotMatch(JSON.stringify(res.body), /passwordCipher|usernameCipher|credential/i);
  } finally {
    hub.requestInternal = original;
  }
});

test('profile update accepts only fixed environment fields and audits no credentials', async () => {
  const requestInternal = hub.requestInternal;
  const record = audit.record;
  const calls = [];
  const audits = [];
  hub.requestInternal = async (...args) => {
    calls.push(args);
    return {
      ok: true,
      body: {
        environment: 'production', username: 'fa••••od', passwordConfigured: true,
        processingMode: 'observe', pharmacyCount: 2,
      },
    };
  };
  audit.record = async (entry) => { audits.push(entry); };
  try {
    const invalid = response();
    await controller.updatePartnerProfile({
      params: { environment: 'staging' }, admin: ADMIN,
      body: { username: 'user', password: 'pass', baseUrl: 'https://attacker.invalid' },
    }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls.length, 0);

    const res = response();
    await controller.updatePartnerProfile({
      params: { environment: 'production' }, admin: ADMIN,
      body: { username: ' fairhaven ', password: 'private-value', processingMode: 'observe' },
    }, res);

    assert.deepEqual(calls[0], [
      'PUT', ['internal', 'medicalka', 'partner', 'profiles', 'production'],
      { body: { username: 'fairhaven', password: 'private-value', processingMode: 'observe' } },
    ]);
    assert.equal(res.body.data.pharmacyCount, 2);
    assert.equal(audits[0].action, 'medicalka.partner.profile.update');
    assert.deepEqual(audits[0].summary, {
      environment: 'production', outcome: 'validated', pharmacyCount: 2,
    });
    assert.doesNotMatch(JSON.stringify(audits), /fairhaven|private-value|password|username/i);
  } finally {
    hub.requestInternal = requestInternal;
    audit.record = record;
  }
});

test('activation and processing mode use fixed enums and sanitized audit', async () => {
  const requestInternal = hub.requestInternal;
  const record = audit.record;
  const calls = [];
  const audits = [];
  hub.requestInternal = async (...args) => {
    calls.push(args);
    return { ok: true, body: { activeEnvironment: 'production', pharmacyCount: 3 } };
  };
  audit.record = async (entry) => { audits.push(entry); };
  try {
    const badEnvironment = response();
    await controller.activatePartnerProfile({ body: { environment: 'local' } }, badEnvironment);
    assert.equal(badEnvironment.statusCode, 400);

    const unsafeStaging = response();
    await controller.setPartnerMode({
      body: { environment: 'staging', processingMode: 'live' },
    }, unsafeStaging);
    assert.equal(unsafeStaging.statusCode, 400);

    await controller.activatePartnerProfile({
      admin: ADMIN, body: { environment: 'production' },
    }, response());
    await controller.setPartnerMode({
      admin: ADMIN, body: { environment: 'production', processingMode: 'live' },
    }, response());

    assert.deepEqual(calls.map((row) => row.slice(0, 2)), [
      ['POST', ['internal', 'medicalka', 'partner', 'activate']],
      ['POST', ['internal', 'medicalka', 'partner', 'mode']],
    ]);
    assert.deepEqual(audits.map((entry) => entry.summary), [
      { environment: 'production', outcome: 'activated', pharmacyCount: 3 },
      { environment: 'production', outcome: 'live', pharmacyCount: 3 },
    ]);
  } finally {
    hub.requestInternal = requestInternal;
    audit.record = record;
  }
});

test('partner settings routes stay under authenticated channels surface', () => {
  const routes = require('../routes/adminRoutes').stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: layer.route.methods }));
  assert.ok(routes.some((row) => (
    row.path === '/channels/medicalka/partner' && row.methods.get
  )));
  assert.ok(routes.some((row) => (
    row.path === '/channels/medicalka/partner/profiles/:environment' && row.methods.put
  )));
});
