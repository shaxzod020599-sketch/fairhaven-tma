const SiteContent = require('../models/SiteContent');
const { sendError } = require('../utils/http');

const KEY = 'main';
const MAX_BYTES = 1.5 * 1024 * 1024; // generous cap for texts + url lists

/** GET /api/public/site-content — consumed by the public site on load. */
exports.getPublic = async (_req, res) => {
  try {
    const doc = await SiteContent.findOne({ key: KEY }).lean();
    res.json({ success: true, data: doc ? doc.data : null });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** PUT /api/web/admin/site-content — replaces the whole content bundle. */
exports.update = async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, error: 'data_object_required' });
    }
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BYTES) {
      return res.status(413).json({ success: false, error: 'too_large' });
    }
    const doc = await SiteContent.findOneAndUpdate(
      { key: KEY },
      { data, updatedBy: req.webUser.telegramId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: doc.data });
  } catch (err) {
    sendError(res, 500, err);
  }
};
