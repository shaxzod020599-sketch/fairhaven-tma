const User = require('../models/User');

exports.getOrCreate = async (req, res) => {
  try {
    const { telegramId, firstName, lastName, username, photoUrl, languageCode } = req.body;

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
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) });
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
    const user = await User.findOneAndUpdate(
      { telegramId: Number(req.params.telegramId) },
      req.body,
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
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    user.savedAddresses.push(req.body);
    await user.save();
    res.json({ success: true, data: user.savedAddresses });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.removeAddress = async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) });
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
