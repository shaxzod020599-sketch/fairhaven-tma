const mongoose = require('mongoose');
const { defineReadModel } = require('../db');

/**
 * Read-only view of the bot backend's `products` collection.
 *
 * The bot owns this data; the schema here is a narrow projection of the fields
 * a channel feed needs, not a second definition of the model. `defineReadModel`
 * returns a facade with no write methods on it at all.
 */
const productCardSchema = new mongoose.Schema({
  name: String,
  nameUz: String,
  description: String,
  descriptionUz: String,
  brand: String,
  sku: String,
  barcode: String,
  category: String,
  imageUrl: String,
  images: [String],
  isAvailable: Boolean,
  price: Number,
  billzProductId: String,
  mxikCode: String,
  packageCode: String,
  channels: mongoose.Schema.Types.Mixed,
  updatedAt: Date,
}, { collection: 'products', strict: false });

let model = null;

module.exports = function ProductCard() {
  if (!model) model = defineReadModel('ProductCard', productCardSchema, 'products');
  return model;
};
