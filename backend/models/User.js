const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  addressString: { type: String, required: true },
}, { _id: true });

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  username: { type: String, default: '' },
  phone: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  languageCode: { type: String, default: 'ru' },
  balance: { type: Number, default: 0 },
  savedAddresses: [addressSchema],
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
}, {
  timestamps: true,
});

userSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

module.exports = mongoose.model('User', userSchema);
