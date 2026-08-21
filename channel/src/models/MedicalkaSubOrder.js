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
  lastAction: {
    kind: { type: String, default: '' },
    value: { type: String, default: '' },
    actorType: { type: String, default: '' },
    actorTelegramId: { type: Number, default: null },
    actorName: { type: String, default: '' },
    at: { type: Date, default: null },
  },
}, { timestamps: true });

schema.index({ paymentStatus: 1, status: 1, sourceCreatedAt: -1 });

let model = null;

module.exports = function MedicalkaSubOrder() {
  if (!model) model = defineModel('MedicalkaSubOrder', schema, 'medicalkasuborders');
  return model;
};
