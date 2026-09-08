const mongoose = require('mongoose');
const { defineModel } = require('../db');

// Append-only publication history. No TTL: an omitted item retains its last
// Yandex stock, so even hard-deleted products need a durable zero-stock row.
const schema = new mongoose.Schema({
  placeId: { type: String, required: true, immutable: true },
  itemId: { type: String, required: true, immutable: true },
}, { timestamps: true });
schema.index({ placeId: 1, itemId: 1 }, { unique: true });
let model;
module.exports = function YandexPublishedItem() {
  if (!model) model = defineModel('YandexPublishedItem', schema, 'yandexpublisheditems');
  return model;
};
