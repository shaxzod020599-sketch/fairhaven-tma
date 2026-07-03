const mongoose = require('mongoose');

/**
 * Editable site copy managed from the web admin panel: hero texts,
 * testimonials, 3D gallery images, blog posts, announcement lines.
 * One document per key; `main` holds the whole public-site bundle.
 * The client deep-merges this over its built-in defaults, so missing
 * fields always fall back safely.
 */
const siteContentSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  updatedBy: { type: Number, default: null }, // admin telegramId
}, {
  timestamps: true,
  minimize: false,
});

module.exports = mongoose.model('SiteContent', siteContentSchema);
