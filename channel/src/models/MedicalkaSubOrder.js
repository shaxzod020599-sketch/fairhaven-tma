const mongoose = require('mongoose');
const { defineModel } = require('../db');

const itemSchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  productExternalId: { type: mongoose.Schema.Types.Mixed, default: null },
  productId: { type: String, default: '' },
  name: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
  markingRequired: { type: Boolean, default: false },
  labels: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const schema = new mongoose.Schema({
  externalId: { type: String, required: true, unique: true },
  orderId: { type: String, default: '' },
  orderNumber: { type: String, default: '' },
  subOrderNumber: { type: String, default: '' },
  pharmacyId: { type: String, default: '' },
  pharmacyName: { type: String, default: '' },
  paymentStatus: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  status: { type: String, default: '', index: true },
  deliveryType: { type: String, default: '' },
  deliveryProvider: { type: String, default: '' },
  courierStatus: { type: String, default: '' },
  deliveryServiceStatus: { type: String, default: '' },
  subtotal: { type: Number, default: 0 },
  sourceCreatedAt: { type: Date, default: null },
  customer: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  items: { type: [itemSchema], default: [] },
  rawIn: { type: mongoose.Schema.Types.Mixed, default: null },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  mapping: {
    state: { type: String, default: 'pending' },
    missingProductIds: { type: [String], default: [] },
  },
  sale: {
    state: { type: String, default: 'pending' },
    channelOrderId: { type: String, default: '' },
    lastError: { type: String, default: '' },
    reconciliationRequired: { type: Boolean, default: false },
  },
  operation: {
    token: { type: String, default: '' },
    kind: { type: String, default: '' },
    value: { type: String, default: '' },
    itemId: { type: String, default: '' },
    valueHash: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    actorType: { type: String, default: '' },
    actorTelegramId: { type: Number, default: null },
    actorName: { type: String, default: '' },
    reconciliationRequired: { type: Boolean, default: false },
    lastError: { type: String, default: '' },
  },
  lastAction: {
    kind: { type: String, default: '' },
    value: { type: String, default: '' },
    actorType: { type: String, default: '' },
    actorTelegramId: { type: Number, default: null },
    actorName: { type: String, default: '' },
    at: { type: Date, default: null },
  },
  notification: {
    claimToken: { type: String, default: '' },
    claimedAt: { type: Date, default: null },
    chatId: { type: String, default: '' },
    messageId: { type: Number, default: null },
    fingerprint: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
    retryAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
  },
}, { timestamps: true });

schema.index({ paymentStatus: 1, status: 1, sourceCreatedAt: -1 });

const SCOPES = Object.freeze({
  production: { modelName: 'MedicalkaSubOrder', collection: 'medicalkasuborders' },
  staging: { modelName: 'MedicalkaSubOrderStaging', collection: 'medicalkasuborders_staging' },
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

function MedicalkaSubOrder(environment = 'production') {
  const selected = scope(environment);
  if (!models.has(environment)) {
    models.set(environment, defineModel(
      selected.modelName, schema, selected.collection
    ));
  }
  return models.get(environment);
}

MedicalkaSubOrder.collectionFor = (environment) => scope(environment).collection;

module.exports = MedicalkaSubOrder;
