const User = require('../models/User');

exports.getOrCreate = async (req, res) => {
  try {
    const telegramId = req.telegramUser.id;
    const username = req.telegramUser.username || '';
    const photoUrl = req.telegramUser.photo_url || '';
    const languageCode = req.telegramUser.language_code || 'ru';

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: username || '',
        photoUrl: photoUrl || '',
        languageCode: languageCode || 'ru',
      });
    } else {
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
    const user = await User.findOne({ telegramId: req.telegramUser.id });
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
    const update = pick(req.body, ['languageCode', 'notificationsEnabled', 'favorites']);
    const user = await User.findOneAndUpdate(
      { telegramId: req.telegramUser.id },
      update,
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
    const user = await User.findOne({ telegramId: req.telegramUser.id });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.savedAddresses.length >= 10) {
      return res.status(400).json({ success: false, error: 'address_limit' });
    }
    const address = pick(req.body, ['label', 'lat', 'lng', 'addressString']);
    user.savedAddresses.push(address);
    await user.save();
    res.json({ success: true, data: user.savedAddresses });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.removeAddress = async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.telegramUser.id });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    user.savedAddresses.id(req.params.addressId).deleteOne();
    await user.save();
    res.json({ success: true, data: user.savedAddresses });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

function pick(body = {}, fields) {
  const out = {};
  for (const field of fields) {
    if (body[field] !== undefined) out[field] = body[field];
  }
  return out;
}
