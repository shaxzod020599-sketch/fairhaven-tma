const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const locationSchema = new mongoose.Schema({
  lat: { type: Number, default: 0 },
  lng: { type: Number, default: 0 },
  addressString: { type: String, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  telegramId: {
    type: Number,
    default: null,
    index: true,
  },
  // Guest (web) checkout only — set when order is placed without a Telegram user.
  email: { type: String, default: '', trim: true },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: [arr => arr.length > 0, 'Order must have at least one item'],
  },
  subtotal: { type: Number, default: 0, min: 0 },
  deliveryFee: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  promoCode: { type: String, default: '' },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  isFirstOrder: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'],
    default: 'pending',
    index: true,
  },
  location: {
    type: locationSchema,
    default: null,
  },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card'],
    default: 'cash',
  },
  notes: { type: String, default: '' },

  // Where the order was placed. Mini-app orders predate this field and keep
  // the default; web orders are tagged explicitly for the channel receipt.
  source: {
    type: String,
    enum: ['miniapp', 'web', 'web-guest'],
    default: 'miniapp',
  },
  // Random capability token for guest web orders — lets the success page
  // fetch its own order without exposing /orders/:id publicly.
  accessToken: { type: String, default: '' },

  channelMessageId: { type: Number, default: null },

  /**
   * Progress of this order through the Billz bridge.
   *
   * The bridge does not listen for events. It compares `dispatched` with the
   * goal implied by `status` and closes the gap, which means a missed hook, a
   * crash mid-write or a restart all self-correct on the next pass — there is no
   * queue of events to lose. `nextAttemptAt` doubles as the lease that stops two
   * backend instances working the same order at once.
   *
   * Untouched for orders placed before the bridge was switched on: history is
   * not replayed into Billz.
   */
  billzSync: {
    dispatched: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    // Set when the goal can no longer be reached — a cancellation after
    // delivery, say. Retrying cannot fix it, so the bridge stops and an
    // operator settles it in Billz by hand.
    conflict: { type: String, default: '' },
  },
}, {
  timestamps: true,
});

// Serves the bridge's scan: narrow by status first, then by what has already
// been dispatched, then by age.
orderSchema.index(
  { status: 1, 'billzSync.dispatched': 1, createdAt: 1 },
  { name: 'billz_bridge_scan' }
);

module.exports = mongoose.model('Order', orderSchema);
