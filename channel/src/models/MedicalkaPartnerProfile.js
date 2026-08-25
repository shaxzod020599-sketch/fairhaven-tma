const mongoose = require('mongoose');
const { defineModel } = require('../db');

const pharmacySchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  environment: { type: String, enum: ['staging', 'production'], required: true, unique: true },
  baseUrl: { type: String, required: true },
  usernameCipher: { type: String, required: true },
  passwordCipher: { type: String, required: true },
  processingMode: { type: String, enum: ['observe', 'live'], default: 'observe' },
  active: { type: Boolean, default: false, index: true },
  pharmacies: { type: [pharmacySchema], default: [] },
  lastValidatedAt: { type: Date, default: null },
  health: {
    lastSuccessAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: '' },
  },
}, { timestamps: true });

let model = null;

module.exports = function MedicalkaPartnerProfile() {
  if (!model) {
    model = defineModel(
      'MedicalkaPartnerProfile', schema, 'medicalkapartnerprofiles'
    );
  }
  return model;
};
