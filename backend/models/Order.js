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
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  addressString: { type: String, required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  telegramId: {
    type: Number,
    required: true,
    index: true,
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: [arr => arr.length > 0, 'Order must have at least one item'],
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'],
    default: 'pending',
    index: true,
  },
  location: {
    type: locationSchema,
    required: true,
  },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card'],
    default: 'cash',
  },
  notes: { type: String, default: '' },

  // Channel message tracking (for editing on approve/reject)
  channelMessageId: { type: Number, default: null },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Order', orderSchema);
