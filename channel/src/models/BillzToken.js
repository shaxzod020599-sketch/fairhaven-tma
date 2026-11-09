const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * Billz access tokens live for 15 days. Persisting the current one means a
 * restart or redeploy reuses it instead of spending a login round-trip, and it
 * keeps every process in the deployment on the same token.
 *
 * One document per integration key, keyed by `kind`: `default` for the shared
 * key, the channel name for a channel's own key.
 */
const billzTokenSchema = new mongoose.Schema({
  kind: { type: String, required: true, unique: true, default: 'default' },
  // Short hash of the secret that issued this token. A token is reused only
  // while the configured secret still matches it.
  fingerprint: { type: String, default: '' },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

let model = null;

module.exports = function BillzToken() {
  if (!model) model = defineModel('BillzToken', billzTokenSchema, 'billztokens');
  return model;
};
