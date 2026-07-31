const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * One document per sync run. The admin panel reads the newest one to show when
 * stock was last refreshed and whether the run was rejected.
 */
const syncLogSchema = new mongoose.Schema({
  kind: { type: String, default: 'catalog' },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  ok: { type: Boolean, default: false },
  // Set when a run was refused rather than failed — e.g. the guard rail below
  // the expected catalogue size tripped.
  rejectedReason: { type: String, default: '' },
  seen: { type: Number, default: 0 },
  created: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  markedDeleted: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  error: { type: String, default: '' },
}, { timestamps: true });

syncLogSchema.index({ createdAt: -1 });

let model = null;

module.exports = function SyncLog() {
  if (!model) model = defineModel('SyncLog', syncLogSchema, 'synclogs');
  return model;
};
