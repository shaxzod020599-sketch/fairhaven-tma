const Collection = require('../models/Collection');
const Setting = require('../models/Setting');
const { sendError } = require('../utils/http');

const PUBLIC_SETTING_KEYS = [
  'support_phone',
  'support_phone_tel',
  'support_hours',
  'free_delivery_threshold',
  'delivery_city',
  'delivery_region_ru',
  'delivery_region_uz',
  'brand_tagline',
];

exports.listCollections = async (_req, res) => {
  try {
    const items = await Collection.find({ visible: true })
      .populate('productIds', 'name imageUrl price isAvailable brand category')
      .sort({ sortOrder: 1, createdAt: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getCollection = async (req, res) => {
  try {
    const c = await Collection.findById(req.params.id)
      .populate('productIds');
    if (!c || !c.visible) {
      return res.status(404).json({ success: false, error: 'not_found' });
    }
    res.json({ success: true, data: c });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getSettings = async (_req, res) => {
  try {
    const items = await Setting.find({ key: { $in: PUBLIC_SETTING_KEYS } });
    const dict = {};
    for (const item of items) dict[item.key] = item.value;
    res.json({ success: true, data: dict });
  } catch (err) {
    sendError(res, 500, err);
  }
};
