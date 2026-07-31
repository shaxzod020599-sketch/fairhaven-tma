const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * Monotonic counters.
 *
 * Medicalka's contract types product ids as integers, while Billz identifies
 * products by UUID. Rather than derive a number from the UUID — any truncation
 * risks a collision, and a derived id changes if the derivation does — each
 * product gets a small integer allocated once and kept forever.
 */
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
}, { timestamps: true });

let model = null;

function Counter() {
  if (!model) model = defineModel('Counter', counterSchema, 'channelcounters');
  return model;
}

/** Atomically reserves the next value. Safe under concurrent callers. */
async function nextValue(name) {
  const doc = await Counter().findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  ).lean();
  return doc.value;
}

module.exports = Counter;
module.exports.nextValue = nextValue;
