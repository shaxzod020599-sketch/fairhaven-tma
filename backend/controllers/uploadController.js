const fs = require('fs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { sendError } = require('../utils/http');

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

function isValidImageSignature(buf, mime) {
  if (!Buffer.isBuffer(buf)) return false;
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buf.length >= 8 && buf.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (mime === 'image/webp') {
    return buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mime === 'image/gif') {
    const signature = buf.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  return false;
}

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
    if (!isValidImageSignature(buf, mime)) {
      return res.status(415).json({ success: false, error: 'invalid_image' });
    }
    const id = crypto.randomBytes(10).toString('hex');
    const filename = `${Date.now()}-${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);

    const url = `/uploads/${filename}`;
    res.json({ success: true, data: { url, filename, size: buf.length } });
  } catch (err) {
    sendError(res, 500, err);
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
    sendError(res, 500, err);
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
    sendError(res, 500, err);
  }
};

exports.UPLOAD_DIR = UPLOAD_DIR;
exports.isValidImageSignature = isValidImageSignature;

/* ── Video uploads (admin) — streamed to disk via multer ──────────────── */

const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_MIME_EXT = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = VIDEO_MIME_EXT[file.mimetype] || 'mp4';
    cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}.${ext}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, Boolean(VIDEO_MIME_EXT[file.mimetype]));
  },
}).single('video');

function isValidVideoSignature(fd) {
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  // mp4/mov: '....ftyp' · webm/mkv: EBML magic
  if (head.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
}

exports.uploadVideo = (req, res) => {
  videoUpload(req, res, (err) => {
    try {
      if (err) {
        const code = err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload_failed';
        return res.status(413).json({ success: false, error: code });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'video_required' });
      }
      const fd = fs.openSync(req.file.path, 'r');
      const ok = isValidVideoSignature(fd);
      fs.closeSync(fd);
      if (!ok) {
        fs.unlinkSync(req.file.path);
        return res.status(415).json({ success: false, error: 'invalid_video' });
      }
      res.json({
        success: true,
        data: { url: `/uploads/${req.file.filename}`, size: req.file.size },
      });
    } catch (e) {
      sendError(res, 500, e);
    }
  });
};
