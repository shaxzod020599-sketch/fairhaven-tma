const mongoose = require('mongoose');

const promoSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  description: { type: String, default: '' },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage',
  },
  discountValue: { type: Number, required: true, min: 0 },
  minOrderAmount: { type: Number, default: 0, min: 0 },
  maxDiscount: { type: Number, default: 0, min: 0 },
  firstOrderOnly: { type: Boolean, default: false },
  oncePerUser: { type: Boolean, default: true },
  maxUses: { type: Number, default: 0, min: 0 },
  usedCount: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true, index: true },
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, {
  timestamps: true,
});

promoSchema.methods.isCurrentlyActive = function () {
  if (!this.isActive) return false;
  const now = new Date();
  if (this.startsAt && now < this.startsAt) return false;
  if (this.expiresAt && now > this.expiresAt) return false;
  if (this.maxUses > 0 && this.usedCount >= this.maxUses) return false;
  return true;
};

promoSchema.methods.calculateDiscount = function (subtotal) {
  if (subtotal < (this.minOrderAmount || 0)) return 0;
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = Math.round((subtotal * this.discountValue) / 100);
  } else {
    discount = Math.round(this.discountValue);
  }
  if (this.maxDiscount > 0 && discount > this.maxDiscount) {
    discount = this.maxDiscount;
  }
  return Math.min(discount, subtotal);
};

module.exports = mongoose.model('PromoCode', promoSchema);
