const mongoose = require('mongoose');

/**
 * Per-channel selling configuration.
 *
 * Prices are set by hand rather than derived from Billz: the Billz retail price
 * is a reference, and each marketplace carries its own commission and pricing
 * agreement. A channel with no price is not published — publishing at 0 would
 * be worse than being absent.
 *
 * `forceStatus` lets an operator override availability regardless of stock:
 *   auto — follow Billz stock minus reservations (the default)
 *   in   — always show as available
 *   out  — always hide, e.g. while a batch is being checked
 */
const channelConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  price: { type: Number, default: 0, min: 0 },
  oldPrice: { type: Number, default: 0, min: 0 },
  forceStatus: { type: String, enum: ['auto', 'in', 'out'], default: 'auto' },
  // Units held back from this channel so the shop floor never sells the last one.
  minStock: { type: Number, default: 0, min: 0 },
}, { _id: false });

const channelsSchema = new mongoose.Schema({
  medicalka: { type: channelConfigSchema, default: () => ({}) },
  uzum: { type: channelConfigSchema, default: () => ({}) },
}, { _id: false });

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
  oldPrice: {
    type: Number,
    default: 0,
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
  barcode: { type: String, default: '' },
  tags: [{ type: String }],

  // ── Stock automation ──────────────────────────────────────────────────────
  // A new product stays hidden until an operator approves it. Absent on
  // existing documents, and only an explicit `false` hides — so nothing
  // already in the shop disappears when this field is introduced.
  approved: { type: Boolean, default: true },
  // Set to false by the manual availability toggle: once an operator decides,
  // the reconciler stops touching this product.
  autoStock: { type: Boolean, default: true },

  // ── Sales channels (Medicalka, Uzum Tezkor) ───────────────────────────────
  // Link to the mirrored Billz product. Stock and the reference retail price
  // come from there; the bot's own `price` above is unaffected.
  // Indexed below, with the uniqueness constraint. Declaring `index: true`
  // here as well produced two definitions with the same auto-generated name,
  // and Mongo rejected the second one — so the constraint silently never
  // existed.
  billzProductId: { type: String, default: '' },
  // ИКПУ. Empty means the shop-wide default applies — see Setting
  // `channels.defaultMxikCode`. Uzum requires a code, Medicalka does not.
  mxikCode: { type: String, default: '' },
  packageCode: { type: String, default: '' },
  channels: {
    type: channelsSchema,
    default: () => ({}),
  },
}, {
  timestamps: true,
});

productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 }, { sparse: true });

// One Billz product backs at most one card. Two cards sharing it would each
// sell the same stock without knowing about the other, and the check in the
// linking endpoint is a race, not a guarantee.
//
// Partial rather than sparse: the field defaults to an empty string, which
// sparse would still index, so every unlinked product would collide with every
// other one.
productSchema.index(
  { billzProductId: 1 },
  {
    name: 'billzProductId_unique',
    unique: true,
    partialFilterExpression: { billzProductId: { $type: 'string', $gt: '' } },
  }
);
productSchema.index({ 'channels.medicalka.enabled': 1 });
productSchema.index({ 'channels.uzum.enabled': 1 });

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
