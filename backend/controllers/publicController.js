const Collection = require('../models/Collection');
const Setting = require('../models/Setting');
const { sendError } = require('../utils/http');
const { LISTED, PUBLIC_SELECT, toPublicProduct } = require('../utils/publicProduct');

// Collections link products by id; an unapproved one must not surface through
// them, and the linked cards get the same public shape as /api/products.
const PUBLIC_PRODUCTS = { path: 'productIds', select: PUBLIC_SELECT, match: LISTED };

function publicCollection(collection) {
  return {
    ...collection,
    productIds: (collection.productIds || []).filter(Boolean).map(toPublicProduct),
  };
}

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
      .populate(PUBLIC_PRODUCTS)
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, data: items.map(publicCollection) });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.getCollection = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) {
      return res.status(404).json({ success: false, error: 'not_found' });
    }
    const c = await Collection.findById(req.params.id)
      .populate(PUBLIC_PRODUCTS)
      .lean();
    if (!c || !c.visible) {
      return res.status(404).json({ success: false, error: 'not_found' });
    }
    res.json({ success: true, data: publicCollection(c) });
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
