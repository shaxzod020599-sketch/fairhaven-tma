const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Accepts a dataURL uploaded from the admin panel. The frontend canvas has
 * already beautified the image (square crop, warm paper background, sharpen,
 * resize) so here we only validate & persist to disk.
 */
exports.uploadImage = async (req, res) => {
  try {
    ensureDir();
    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ success: false, error: 'dataUrl required' });
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ success: false, error: 'invalid_data_url' });
    }
    const mime = match[1];
    const ext = MIME_EXT[mime];
    if (!ext) {
      return res.status(415).json({ success: false, error: 'unsupported_mime' });
    }
    const buf = Buffer.from(match[2], 'base64');
    const MAX_BYTES = 4 * 1024 * 1024;
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ success: false, error: 'too_large' });
    }
    const id = crypto.randomBytes(10).toString('hex');
    const filename = `${Date.now()}-${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);

    const url = `/uploads/${filename}`;
    res.json({ success: true, data: { url, filename, size: buf.length } });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.listUploads = async (_req, res) => {
  try {
    ensureDir();
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return { filename: f, url: `/uploads/${f}`, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteUpload = async (req, res) => {
  try {
    ensureDir();
    const filename = req.params.filename;
    if (!/^[\w.\-]+$/.test(filename)) {
      return res.status(400).json({ success: false, error: 'bad_filename' });
    }
    const p = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.UPLOAD_DIR = UPLOAD_DIR;
