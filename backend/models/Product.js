const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  nameUz: { type: String, default: '' },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'cosmetics',
      'parapharmaceuticals',
      'supplements',
      'vitamins',
      'hygiene',
      'drinks',
    ],
    index: true,
  },
  imageUrl: { type: String, default: '' },
  images: {
    type: [{ type: String }],
    default: [],
  },
  description: { type: String, default: '' },
  descriptionUz: { type: String, default: '' },
  descriptionUzLat: { type: String, default: '' },
  isAvailable: {
    type: Boolean,
    default: true,
    index: true,
  },
  brand: { type: String, default: '' },
  sku: { type: String, default: '' },
  tags: [{ type: String }],
}, {
  timestamps: true,
});

productSchema.index({ name: 'text', description: 'text', brand: 'text' });

productSchema.virtual('allImages').get(function () {
  const out = [];
  if (this.imageUrl) out.push(this.imageUrl);
  if (Array.isArray(this.images)) {
    for (const u of this.images) {
      if (u && !out.includes(u)) out.push(u);
    }
  }
  return out;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
