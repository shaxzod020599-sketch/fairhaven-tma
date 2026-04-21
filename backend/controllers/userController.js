const User = require('../models/User');
const { ensureObjectId, parseTelegramId, pick, toSafeString } = require('../utils/validators');

const ALLOWED_USER_UPDATE_FIELDS = [
  'firstName',
  'lastName',
  'username',
  'photoUrl',
  'languageCode',
  'phone',
];

exports.getOrCreate = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.body.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const firstName = toSafeString(req.body.firstName, { max: 100 });
    const lastName = toSafeString(req.body.lastName, { max: 100 });
    const username = toSafeString(req.body.username, { max: 100 });
    const photoUrl = toSafeString(req.body.photoUrl, { max: 500 });
    const languageCode = toSafeString(req.body.languageCode || 'ru', { max: 10 });

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        firstName: firstName || '',
        lastName: lastName || '',
        username: username || '',
        photoUrl: photoUrl || '',
        languageCode: languageCode || 'ru',
      });
    } else {
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (username) user.username = username;
      if (photoUrl) user.photoUrl = photoUrl;
      if (languageCode) user.languageCode = languageCode;
      await user.save();
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getByTelegramId = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.params.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.params.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const payload = pick(req.body || {}, ALLOWED_USER_UPDATE_FIELDS);
    const user = await User.findOneAndUpdate(
      { telegramId },
      payload,
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.params.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const addressString = toSafeString(req.body?.addressString, { max: 500 });
    const label = toSafeString(req.body?.label, { max: 100 });
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ success: false, error: 'Invalid latitude' });
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, error: 'Invalid longitude' });
    }
    if (!addressString) {
      return res.status(400).json({ success: false, error: 'Address is required' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    user.savedAddresses.push({ lat, lng, addressString, label });
    await user.save();
    res.json({ success: true, data: user.savedAddresses });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.removeAddress = async (req, res) => {
  try {
    const telegramId = parseTelegramId(req.params.telegramId);
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'Invalid telegramId' });
    }
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!ensureObjectId(req.params.addressId)) {
      return res.status(400).json({ success: false, error: 'Invalid address id' });
    }
    const address = user.savedAddresses.id(req.params.addressId);
    if (!address) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }
    address.deleteOne();
    await user.save();
    res.json({ success: true, data: user.savedAddresses });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};
