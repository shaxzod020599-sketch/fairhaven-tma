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
  username: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  languageCode: { type: String, default: 'ru' },

  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  birthYear: { type: Number, default: null },
  gender: {
    type: String,
    enum: ['male', 'female', ''],
    default: '',
  },
  phone: { type: String, default: '' },

  consentAccepted: { type: Boolean, default: false },
  consentAcceptedAt: { type: Date, default: null },

  registrationStep: {
    type: String,
    enum: [
      'awaiting_name',
      'awaiting_surname',
      'awaiting_year',
      'awaiting_gender',
      'awaiting_phone',
      'awaiting_consent',
      'done',
    ],
    default: 'awaiting_name',
  },

  savedAddresses: [addressSchema],
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },

  notificationsEnabled: { type: Boolean, default: true },

  promoCodesUsed: [{ type: String }],
}, {
  timestamps: true,
});

userSchema.methods.isRegistered = function () {
  return this.registrationStep === 'done' && this.consentAccepted;
};

userSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

module.exports = mongoose.model('User', userSchema);
