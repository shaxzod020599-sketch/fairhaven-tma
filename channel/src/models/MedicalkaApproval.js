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
  },
  notification: {
    claimToken: { type: String, default: '' },
    claimedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
  },
  sync: {
    lastError: { type: String, default: '' },
    lastSuccessAt: { type: Date, default: null },
  },
}, { timestamps: true });

approvalSchema.index({ status: 1, deadlineAt: 1 });

let model = null;

module.exports = function MedicalkaApproval() {
  if (!model) model = defineModel('MedicalkaApproval', approvalSchema, 'medicalkaapprovals');
  return model;
};
