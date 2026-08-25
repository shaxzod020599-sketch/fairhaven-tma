const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';

const MedicalkaApproval = require('../src/models/MedicalkaApproval');
const MedicalkaSubOrder = require('../src/models/MedicalkaSubOrder');
const { createPartnerRuntimeManager } = require('../src/medicalka/runtimeManager');

test('staging and production resolve to separate durable collections', () => {
  assert.equal(MedicalkaApproval.collectionFor('production'), 'medicalkaapprovals');
  assert.equal(MedicalkaApproval.collectionFor('staging'), 'medicalkaapprovals_staging');
  assert.equal(MedicalkaSubOrder.collectionFor('production'), 'medicalkasuborders');
  assert.equal(MedicalkaSubOrder.collectionFor('staging'), 'medicalkasuborders_staging');
  assert.throws(() => MedicalkaApproval.collectionFor('local'), /medicalka_invalid_environment/);
});

function harness({ inProgress = false, failStaging = false } = {}) {
  const events = [];
  const rows = {
    production: { environment: 'production', active: true, processingMode: 'observe' },
    staging: { environment: 'staging', active: false, processingMode: 'observe' },
  };
  const profiles = {
    async get(environment) { return rows[environment] || null; },
    async getActive() { return Object.values(rows).find((row) => row.active) || null; },
    async listSummaries() { return Object.values(rows).map((row) => ({ ...row })); },
    async setActive(environment) {
      events.push(`persist:${environment}`);
      for (const row of Object.values(rows)) row.active = row.environment === environment;
      return { ...rows[environment] };
    },
    async setProcessingMode(environment, mode) {
      rows[environment].processingMode = environment === 'staging' ? 'observe' : mode;
      return { ...rows[environment] };
    },
    async validateAndSave(input) {
      if (input.username === 'bad') {
        const err = new Error('medicalka_profile_validation_failed');
        err.code = 'medicalka_profile_validation_failed';
        throw err;
      }
      Object.assign(rows[input.environment], input);
      return { ...rows[input.environment] };
    },
  };
  const contexts = new Map();
  const createContext = (profile) => {
    const context = {
      environment: profile.environment,
      async start() {
        events.push(`start:${profile.environment}`);
        if (profile.environment === 'staging' && failStaging) {
          throw new Error('staging failed to start');
        }
      },
      stop() { events.push(`stop:${profile.environment}`); },
      async hasInProgress() { return profile.environment === 'production' && inProgress; },
    };
    contexts.set(profile.environment, context);
    return context;
  };
  return {
    events,
    rows,
    manager: createPartnerRuntimeManager({ profiles, createContext }),
  };
}

test('hot switch starts target, persists selection, then stops old context', async () => {
  const { manager, events } = harness();
  await manager.start();
  await manager.activate('staging');

  assert.equal(manager.current().environment, 'staging');
  assert.deepEqual(events, [
    'start:production', 'start:staging', 'persist:staging', 'stop:production',
  ]);
});

test('in-progress work refuses a switch before target starts or state changes', async () => {
  const { manager, events, rows } = harness({ inProgress: true });
  await manager.start();

  await assert.rejects(
    () => manager.activate('staging'),
    (err) => err.code === 'medicalka_runtime_busy'
  );
  assert.equal(manager.current().environment, 'production');
  assert.equal(rows.production.active, true);
  assert.deepEqual(events, ['start:production']);
});

test('failed target startup preserves old active context and durable selection', async () => {
  const { manager, events, rows } = harness({ failStaging: true });
  await manager.start();

  await assert.rejects(() => manager.activate('staging'), /staging failed to start/);
  assert.equal(manager.current().environment, 'production');
  assert.equal(rows.production.active, true);
  assert.deepEqual(events, ['start:production', 'start:staging', 'stop:staging']);
});

test('invalid profile update leaves active context untouched', async () => {
  const { manager, events } = harness();
  await manager.start();

  await assert.rejects(
    () => manager.updateProfile({ environment: 'production', username: 'bad' }),
    (err) => err.code === 'medicalka_profile_validation_failed'
  );
  assert.equal(manager.current().environment, 'production');
  assert.deepEqual(events, ['start:production']);
});
