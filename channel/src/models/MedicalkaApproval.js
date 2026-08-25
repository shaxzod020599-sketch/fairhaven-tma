const mongoose = require('mongoose');
const { defineModel } = require('../db');

const approvalItemSchema = new mongoose.Schema({
  stockId: { type: String, default: '' },
  productId: { type: String, default: '' },
  name: { type: String, default: '' },
  externalName: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
}, { _id: false });

const approvalSchema = new mongoose.Schema({
  externalId: { type: String, required: true, unique: true },
  checkoutId: { type: String, required: true },
  pharmacyId: { type: String, required: true },
  pharmacyName: { type: String, default: '' },
  status: { type: String, required: true, default: 'pending', index: true },
  comment: { type: String, default: '' },
  sourceCreatedAt: { type: Date, default: null },
  deadlineAt: { type: Date, default: null, index: true },
  checkoutStatus: { type: String, default: '' },
  checkoutActive: { type: Boolean, default: false },
  requiresAction: { type: Boolean, default: false },
  deliveryType: { type: String, default: '' },
  deliveryData: { type: mongoose.Schema.Types.Mixed, default: null },
  orderId: { type: String, default: '' },
  customer: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  items: { type: [approvalItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  approvals: { type: [mongoose.Schema.Types.Mixed], default: [] },
  rawIn: { type: mongoose.Schema.Types.Mixed, default: null },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  decision: {
    action: { type: String, default: '' },
    actorType: { type: String, default: '' },
    actorTelegramId: { type: Number, default: null },
    actorName: { type: String, default: '' },
    comment: { type: String, default: '' },
    at: { type: Date, default: null },
  },
  operation: {
    token: { type: String, default: '' },
    action: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    actorType: { type: String, default: '' },
    actorTelegramId: { type: Number, default: null },
    actorName: { type: String, default: '' },
    comment: { type: String, default: '' },
    reconciliationRequired: { type: Boolean, default: false },
  },
  notification: {
    claimToken: { type: String, default: '' },
    claimedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    retryAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    messages: {
      type: [{
        telegramId: { type: Number, required: true },
        messageId: { type: Number, required: true },
        sentAt: { type: Date, required: true },
        finalizedAt: { type: Date, default: null },
        finalizeAttempts: { type: Number, default: 0 },
        finalizeRetryAt: { type: Date, default: null },
        finalizeLastError: { type: String, default: '' },
      }],
      default: [],
    },
  },
  sync: {
    lastError: { type: String, default: '' },
    lastSuccessAt: { type: Date, default: null },
  },
}, { timestamps: true });

approvalSchema.index({ status: 1, deadlineAt: 1 });

const SCOPES = Object.freeze({
  production: { modelName: 'MedicalkaApproval', collection: 'medicalkaapprovals' },
  staging: { modelName: 'MedicalkaApprovalStaging', collection: 'medicalkaapprovals_staging' },
});
const models = new Map();

function scope(environment = 'production') {
  const selected = SCOPES[environment];
  if (!selected) {
    const err = new Error('medicalka_invalid_environment');
    err.code = 'medicalka_invalid_environment';
    throw err;
  }
  return selected;
}

function MedicalkaApproval(environment = 'production') {
  const selected = scope(environment);
  if (!models.has(environment)) {
    models.set(environment, defineModel(
      selected.modelName, approvalSchema, selected.collection
    ));
  }
  return models.get(environment);
}

MedicalkaApproval.collectionFor = (environment) => scope(environment).collection;

module.exports = MedicalkaApproval;
