const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');

/**
 * Product images for the channel feeds.
 *
 * Two constraints shape this. Billz forbids serving media from their CDN, so no
 * channel is ever handed a Billz URL. And Uzum, following the Yandex Eats
 * contract, wants a hash alongside each image so it can tell an updated picture
 * from an unchanged one without downloading it again.
 *
 * Both are satisfied by the images an operator already uploads: they live on our
 * own disk, they are what the shop shows, and their SHA-1 is cheap to compute
 * once and cache. Nothing is mirrored from Billz — a product with no uploaded
 * image is simply not published to a channel that requires one, which is also
 * the rule the shop itself applies.
 *
 * The cache is keyed on the file's identity rather than its path, so replacing
 * an image in place produces a new hash on the next read.
 */

// Uploads are written as `<timestamp>-<random>.<ext>`, so a path change already
// implies a different file. The size and mtime guard is for the case someone
// overwrites one by hand.
const cache = new Map();
const MAX_CACHE = 5000;

function uploadsDir() {
  return config.uploadsDir;
}

/** Maps `/uploads/x.jpg` to a file, refusing anything that escapes the directory. */
function resolveLocalPath(url) {
  const match = /^\/uploads\/([\w.-]+)$/.exec(String(url || ''));
  if (!match) return null;
  const resolved = path.resolve(uploadsDir(), match[1]);
  // `[\w.-]+` cannot contain a slash, so this cannot traverse — the check stays
  // because the pattern and the join are edited by different people at
  // different times.
  if (!resolved.startsWith(path.resolve(uploadsDir()) + path.sep)) return null;
  return resolved;
}

/**
 * SHA-1 of the image bytes, or null when the file cannot be read.
 *
 * Null rather than a fabricated hash: a hash that does not describe the bytes is
 * worse than none, because the consumer caches on it and never refetches.
 */
function hashFor(url) {
  const file = resolveLocalPath(url);
  if (!file) return null;

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }

  const key = `${file}:${stat.size}:${stat.mtimeMs}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let digest;
  try {
    digest = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch (err) {
    logger.warn('could not hash an image', { url, err: err.message });
    return null;
  }

  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, digest);
  return digest;
}

/** Absolute, publicly reachable URL. Channels cannot fetch a relative path. */
function publicUrl(url) {
  const raw = String(url || '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(config.uzum.imageBaseUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/**
 * Every usable image on a product card, in display order.
 *
 * An image we cannot hash or cannot address publicly is dropped rather than
 * sent broken — a channel that receives a 404 image URL shows an empty tile to
 * a customer.
 */
function imagesFor(card) {
  const urls = [card?.imageUrl, ...(Array.isArray(card?.images) ? card.images : [])]
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);

    const absolute = publicUrl(url);
    const hash = hashFor(url);
    if (!absolute || !hash) continue;
    out.push({ url: absolute, hash });
  }
  return out;
}

function hasUsableImage(card) {
  return imagesFor(card).length > 0;
}

module.exports = { hasUsableImage, hashFor, imagesFor, publicUrl, resolveLocalPath };
module.exports._cache = cache;
