const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  eyebrow: { type: String, default: '' },
  description: { type: String, default: '' },
  tone: {
    type: String,
    enum: ['default', 'terracotta', 'ink', 'sage', 'butter'],
    default: 'default',
  },
  imageUrl: { type: String, default: '' },
  art: { type: String, default: '' },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  sortOrder: { type: Number, default: 0 },
  visible: { type: Boolean, default: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Collection', collectionSchema);
