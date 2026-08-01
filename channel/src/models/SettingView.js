const mongoose = require('mongoose');
const { defineReadModel } = require('../db');

/**
 * Read-only view of the bot backend's `settings` collection.
 *
 * Channel feeds need a handful of operator-set defaults — the MXIK code Uzum
 * requires, for one — and those belong in the panel where an operator can change
 * them, not in this service's environment. Writing them stays with the backend.
 */
const settingSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed,
  label: String,
}, { collection: 'settings', strict: false });

let model = null;

function SettingView() {
  if (!model) model = defineReadModel('SettingView', settingSchema, 'settings');
  return model;
}

/**
 * Reads several settings at once into a plain object.
 *
 * Cached briefly: the catalogue endpoints read these on every product, and an
 * hourly poll of a few hundred products should not be a few hundred queries.
 * The window is short enough that a change in the panel takes effect while an
 * operator is still looking at it.
 */
const CACHE_MS = 30 * 1000;
let cache = { at: 0, values: {} };

async function readSettings(keys) {
  if (Date.now() - cache.at < CACHE_MS) return cache.values;

  const rows = await SettingView().find({ key: { $in: keys } }).lean();
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  cache = { at: Date.now(), values };
  return values;
}

function clearCache() {
  cache = { at: 0, values: {} };
}

module.exports = SettingView;
module.exports.readSettings = readSettings;
module.exports.clearCache = clearCache;
