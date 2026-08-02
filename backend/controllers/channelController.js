const Product = require('../models/Product');
const BillzProductView = require('../models/BillzProductView');
const Setting = require('../models/Setting');
const channelHub = require('../utils/channelHub');
const { sendError } = require('../utils/http');

/**
 * Sales-channel administration.
 *
 * One screen answers the question an operator actually has: for each product,
 * what does Billz hold and what are we charging each marketplace? That means
 * joining two collections the panel cannot usefully show apart — the Fairhaven
 * product card (ours) and the Billz mirror (synced by channel-hub, read-only
 * here).
 */

const CHANNELS = ['medicalka', 'uzum'];
const FORCE_STATUSES = ['auto', 'in', 'out'];
const MAX_LIMIT = 200;
const DEFAULT_MXIK_KEY = 'channels.defaultMxikCode';

function parsePaging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : 50;
  return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * First value of a query parameter, as a string.
 *
 * Express hands back an array when a parameter is repeated
 * (`?search=a&search=b`), and calling a string method on that threw, turning a
 * malformed request into a 500.
 */
function queryString(value) {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return value === undefined || value === null ? '' : String(value);
}

function channelOf(product, channel) {
  return (product.channels && product.channels[channel]) || {};
}

/**
 * What a channel may sell right now.
 *
 * Mirrors channel-hub's rule exactly — if these two ever disagree, the panel
 * would show a state the feed does not serve.
 */
function availability(product, mirror, channel) {
  const cfg = channelOf(product, channel);
  const available = mirror
    ? Math.max(0, (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0))
    : 0;

  let live;
  if (!cfg.enabled) live = false;
  else if (cfg.forceStatus === 'out') live = false;
  else if (!mirror || mirror.deletedInBillz) live = false;
  else if (cfg.forceStatus === 'in') live = true;
  else live = available > (cfg.minStock || 0);

  return {
    enabled: Boolean(cfg.enabled),
    price: Number(cfg.price) || 0,
    oldPrice: Number(cfg.oldPrice) || 0,
    forceStatus: cfg.forceStatus || 'auto',
    minStock: Number(cfg.minStock) || 0,
    // Configured but priceless means "not published" — surfaced so the operator
    // can see why an enabled product is missing from the feed.
    priceMissing: Boolean(cfg.enabled) && !(Number(cfg.price) > 0),
    live,
  };
}

/**
 * Why a product is or is not visible in the shop itself.
 *
 * Mirrors services/stockReconciler.decide so the panel explains exactly what
 * the reconciler will do, rather than showing a value it is about to change.
 */
function shopVisibility(product, mirror) {
  const image = Boolean(
    (product.imageUrl && String(product.imageUrl).trim())
    || (Array.isArray(product.images) && product.images.some((u) => u && String(u).trim()))
  );

  const visible = product.isAvailable !== false;

  if (!image) return { mode: 'blocked', reason: 'no_image', image, visible: false };
  if (product.approved === false) {
    return { mode: 'blocked', reason: 'awaiting_approval', image, visible: false };
  }
  if (product.autoStock === false) {
    return { mode: 'manual', reason: 'manual_override', image, visible };
  }
  if (!product.billzProductId) return { mode: 'manual', reason: 'not_linked', image, visible };
  if (!mirror || mirror.deletedInBillz) {
    return { mode: 'auto', reason: 'gone_from_billz', image, visible: false };
  }

  const free = Math.max(0,
    (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0));
  return {
    mode: 'auto',
    reason: free > 0 ? 'in_stock' : 'out_of_stock',
    image,
    visible: free > 0,
  };
}

function serialise(product, mirror) {
  const channels = {};
  for (const channel of CHANNELS) channels[channel] = availability(product, mirror, channel);

  return {
    _id: product._id,
    name: product.name,
    approved: product.approved !== false,
    autoStock: product.autoStock !== false,
    shop: shopVisibility(product, mirror),
    brand: product.brand || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    imageUrl: product.imageUrl || '',
    // Catalogue fields the Товары card and its editor render and mutate. The
    // channel surfaces only ever read the Billz/channel values below, so these
    // are passed through verbatim for the unified product card.
    price: Number(product.price) || 0,
    oldPrice: Number(product.oldPrice) || 0,
    category: product.category || '',
    nameUz: product.nameUz || '',
    description: product.description || '',
    descriptionUz: product.descriptionUz || '',
    descriptionUzLat: product.descriptionUzLat || '',
    images: Array.isArray(product.images) ? product.images : [],
    tags: Array.isArray(product.tags) ? product.tags : [],
    isAvailable: product.isAvailable !== false,
    mxikCode: product.mxikCode || '',
    billzProductId: product.billzProductId || '',
    billz: mirror ? {
      name: mirror.name,
      sku: mirror.sku,
      barcode: mirror.barcode,
      retailPrice: Number(mirror.retailPrice) || 0,
      stock: Number(mirror.stock) || 0,
      reservedQty: Number(mirror.reservedQty) || 0,
      pendingQty: Number(mirror.pendingQty) || 0,
      available: Math.max(0,
        (mirror.stock || 0) - (mirror.reservedQty || 0) - (mirror.pendingQty || 0)),
      deletedInBillz: Boolean(mirror.deletedInBillz),
      syncedAt: mirror.syncedAt,
    } : null,
    channels,
  };
}

/** Filters that need the joined Billz row, so they cannot run in the query. */
const POST_JOIN_FILTERS = {
  unlinked: (row) => !row.billzProductId || !row.billz,
  no_price: (row) => CHANNELS.some((c) => row.channels[c].priceMissing),
  no_mxik: (row) => !row.mxikCode,
  // Hidden from the shop for want of a photo — the one blocker an operator can
  // clear immediately, so it gets its own filter.
  no_image: (row) => !row.shop.image,
  awaiting_approval: (row) => !row.approved,
  // Only meaningful for a linked product. A card with no Billz counterpart has
  // no stock figure at all, and counting it here made the chip claim most of
  // the catalogue was out of stock.
  out_of_stock: (row) => Boolean(row.billz) && row.billz.available <= 0,
  deleted_in_billz: (row) => Boolean(row.billz && row.billz.deletedInBillz),
};

exports.listProducts = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const search = queryString(req.query.search);
    const channel = queryString(req.query.channel);
    const filter = queryString(req.query.filter);

    const query = {};
    if (search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ name: rx }, { brand: rx }, { sku: rx }, { barcode: rx }];
    }
    if (channel && CHANNELS.includes(channel)) {
      query[`channels.${channel}.enabled`] = true;
    }

    const products = await Product.find(query).sort({ name: 1 }).lean();

    // One query for the mirrors rather than one per product.
    const billzIds = products.map((p) => p.billzProductId).filter(Boolean);
    const mirrors = billzIds.length
      ? await BillzProductView.find({ billzProductId: { $in: billzIds } }).lean()
      : [];
    const byBillzId = new Map(mirrors.map((m) => [m.billzProductId, m]));

    let rows = products.map((p) => serialise(p, byBillzId.get(p.billzProductId)));
    // hasOwnProperty, not a bare lookup: `?filter=__proto__` resolved to an
    // object and crashed Array.filter, and `?filter=constructor` resolved to a
    // function that silently passed every row through.
    if (filter && Object.prototype.hasOwnProperty.call(POST_JOIN_FILTERS, filter)) {
      rows = rows.filter(POST_JOIN_FILTERS[filter]);
    }

    res.json({
      success: true,
      data: rows.slice(skip, skip + limit),
      meta: { total: rows.length, page, limit },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** Counts for the filter chips, so the operator sees what needs attention. */
exports.summary = async (_req, res) => {
  try {
    const products = await Product.find({}).lean();
    const billzIds = products.map((p) => p.billzProductId).filter(Boolean);
    const mirrors = billzIds.length
      ? await BillzProductView.find({ billzProductId: { $in: billzIds } }).lean()
      : [];
    const byBillzId = new Map(mirrors.map((m) => [m.billzProductId, m]));
    const rows = products.map((p) => serialise(p, byBillzId.get(p.billzProductId)));

    const counts = { total: rows.length };
    for (const [key, predicate] of Object.entries(POST_JOIN_FILTERS)) {
      counts[key] = rows.filter(predicate).length;
    }
    for (const channel of CHANNELS) {
      // `live` answers "is there stock"; the feed additionally refuses a
      // product with no price. Counting only `live` overstated the headline
      // against what Medicalka and Uzum actually receive.
      counts[channel] = rows.filter(
        (r) => r.channels[channel].live && !r.channels[channel].priceMissing
      ).length;
    }

    // The Billz side of the headline: what the mirror holds regardless of
    // whether anything is linked yet. Without this the page showed no Billz
    // figures at all until the first product was linked, which read as "the
    // sync is not working" when the sync was fine.
    const [mirrorStats] = await BillzProductView.aggregate([
      { $match: { deletedInBillz: false } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } },
          units: { $sum: '$stock' },
          reserved: { $sum: { $add: ['$reservedQty', '$pendingQty'] } },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        counts,
        mirrorTotal: mirrorStats?.total || 0,
        billz: {
          total: mirrorStats?.total || 0,
          inStock: mirrorStats?.inStock || 0,
          units: mirrorStats?.units || 0,
          reserved: mirrorStats?.reserved || 0,
          linked: billzIds.length,
        },
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

function sanitiseChannelPatch(input) {
  const patch = {};
  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price');
    patch.price = price;
  }
  if (input.oldPrice !== undefined) {
    const oldPrice = Number(input.oldPrice);
    if (!Number.isFinite(oldPrice) || oldPrice < 0) throw new Error('invalid_old_price');
    patch.oldPrice = oldPrice;
  }
  if (input.forceStatus !== undefined) {
    if (!FORCE_STATUSES.includes(input.forceStatus)) throw new Error('invalid_force_status');
    patch.forceStatus = input.forceStatus;
  }
  if (input.minStock !== undefined) {
    const minStock = Number(input.minStock);
    if (!Number.isInteger(minStock) || minStock < 0) throw new Error('invalid_min_stock');
    patch.minStock = minStock;
  }
  return patch;
}

exports.updateProductChannel = async (req, res) => {
  try {
    const { channel } = req.params;
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, error: 'unknown_channel' });
    }

    let patch;
    try {
      patch = sanitiseChannelPatch(req.body || {});
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, error: 'nothing_to_update' });
    }

    const $set = {};
    for (const [key, value] of Object.entries(patch)) {
      $set[`channels.${channel}.${key}`] = value;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true, runValidators: true }
    ).lean();
    if (!product) return res.status(404).json({ success: false, error: 'not_found' });

    const mirror = product.billzProductId
      ? await BillzProductView.findOne({ billzProductId: product.billzProductId }).lean()
      : null;

    res.json({ success: true, data: serialise(product, mirror) });
  } catch (err) {
    sendError(res, 400, err);
  }
};

/**
 * Applies one change to many products.
 *
 * `markupPercent` prices from the Billz retail price, which is the only bulk
 * pricing rule that is actually useful: marketplaces are negotiated as a margin
 * over retail. Products with no Billz mirror are reported back rather than
 * silently skipped — a silent skip reads as "applied to everything".
 */
exports.bulkUpdate = async (req, res) => {
  try {
    const { channel } = req.params;
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, error: 'unknown_channel' });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, error: 'ids_required' });
    if (ids.length > MAX_LIMIT) {
      return res.status(400).json({ success: false, error: 'too_many_ids' });
    }

    const { markupPercent } = req.body || {};
    let patch;
    try {
      patch = sanitiseChannelPatch(req.body || {});
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    const products = await Product.find({ _id: { $in: ids } }).lean();
    const billzIds = products.map((p) => p.billzProductId).filter(Boolean);
    const mirrors = billzIds.length
      ? await BillzProductView.find({ billzProductId: { $in: billzIds } }).lean()
      : [];
    const byBillzId = new Map(mirrors.map((m) => [m.billzProductId, m]));

    const skipped = [];
    const operations = [];

    for (const product of products) {
      const $set = {};
      for (const [key, value] of Object.entries(patch)) {
        $set[`channels.${channel}.${key}`] = value;
      }

      if (markupPercent !== undefined) {
        const percent = Number(markupPercent);
        if (!Number.isFinite(percent) || percent < -100) {
          return res.status(400).json({ success: false, error: 'invalid_markup' });
        }
        const mirror = byBillzId.get(product.billzProductId);
        if (!mirror || !(mirror.retailPrice > 0)) {
          skipped.push({ id: product._id, name: product.name, reason: 'no_billz_price' });
          continue;
        }
        $set[`channels.${channel}.price`] = Math.round(mirror.retailPrice * (1 + percent / 100));
      }

      if (Object.keys($set).length) {
        operations.push({ updateOne: { filter: { _id: product._id }, update: { $set } } });
      }
    }

    if (!operations.length && !skipped.length) {
      return res.status(400).json({ success: false, error: 'nothing_to_update' });
    }
    if (operations.length) await Product.bulkWrite(operations, { ordered: false });

    res.json({ success: true, data: { updated: operations.length, skipped } });
  } catch (err) {
    sendError(res, 400, err);
  }
};

/** Links a Fairhaven product card to a Billz product, or clears the link. */
exports.linkBillz = async (req, res) => {
  try {
    const billzProductId = String(req.body?.billzProductId || '').trim();

    if (billzProductId) {
      const mirror = await BillzProductView.findOne({ billzProductId }).lean();
      if (!mirror) return res.status(404).json({ success: false, error: 'billz_product_not_found' });

      // One Billz product backs one card; two cards would each sell the same
      // stock without knowing about the other.
      const taken = await Product.findOne({
        billzProductId,
        _id: { $ne: req.params.id },
      }).select('name').lean();
      if (taken) {
        return res.status(409).json({
          success: false, error: 'already_linked', message: taken.name,
        });
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { billzProductId } },
      { new: true }
    ).lean();
    if (!product) return res.status(404).json({ success: false, error: 'not_found' });

    const mirror = billzProductId
      ? await BillzProductView.findOne({ billzProductId }).lean()
      : null;
    res.json({ success: true, data: serialise(product, mirror) });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.updateProductMeta = async (req, res) => {
  try {
    const $set = {};
    // Approving a product is what lets it reach customers, so it lives here
    // rather than behind the generic product edit form.
    if (req.body?.approved !== undefined) $set.approved = Boolean(req.body.approved);
    // Handing a product back to the reconciler after a manual decision.
    // Setting availability by hand. Much of the catalogue — nursing pads, test
    // strips, accessories — has no Billz counterpart and is managed this way,
    // so this also pins the product to manual: otherwise the reconciler would
    // hand it straight back to Billz on its next pass.
    if (req.body?.isAvailable !== undefined) {
      $set.isAvailable = Boolean(req.body.isAvailable);
      $set.autoStock = false;
    }
    // Applied last so an explicit value wins. Sending both is contradictory,
    // and silently discarding the one the caller named is the worse answer.
    if (req.body?.autoStock !== undefined) $set.autoStock = Boolean(req.body.autoStock);
    if (req.body?.mxikCode !== undefined) {
      const code = String(req.body.mxikCode).trim();
      if (code && !/^\d{6,20}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'invalid_mxik' });
      }
      $set.mxikCode = code;
    }
    if (req.body?.barcode !== undefined) $set.barcode = String(req.body.barcode).trim();
    if (!Object.keys($set).length) {
      return res.status(400).json({ success: false, error: 'nothing_to_update' });
    }

    const product = await Product.findByIdAndUpdate(req.params.id, { $set }, { new: true }).lean();
    if (!product) return res.status(404).json({ success: false, error: 'not_found' });

    const mirror = product.billzProductId
      ? await BillzProductView.findOne({ billzProductId: product.billzProductId }).lean()
      : null;
    res.json({ success: true, data: serialise(product, mirror) });
  } catch (err) {
    sendError(res, 400, err);
  }
};

/**
 * Billz products available for linking or for adding a new card.
 *
 * Already-linked products are marked rather than hidden, so an operator
 * searching for a product they know exists is told why it is unselectable
 * instead of finding nothing.
 */
exports.searchBillz = async (req, res) => {
  try {
    const { limit } = parsePaging(req.query);
    const search = queryString(req.query.search).trim();

    const query = { deletedInBillz: false };
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { brandName: rx }];
    }

    const mirrors = await BillzProductView.find(query).sort({ name: 1 }).limit(limit).lean();
    const linked = await Product.find({
      billzProductId: { $in: mirrors.map((m) => m.billzProductId) },
    }).select('billzProductId name').lean();
    const linkedBy = new Map(linked.map((p) => [p.billzProductId, p.name]));

    res.json({
      success: true,
      data: mirrors.map((m) => ({
        billzProductId: m.billzProductId,
        name: m.name,
        sku: m.sku,
        barcode: m.barcode,
        brandName: m.brandName,
        categoryName: m.categoryName,
        retailPrice: Number(m.retailPrice) || 0,
        stock: Number(m.stock) || 0,
        linkedTo: linkedBy.get(m.billzProductId) || null,
      })),
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** Last sync outcome, read straight from the log channel-hub writes. */
exports.syncStatus = async (_req, res) => {
  try {
    const mongoose = require('mongoose');
    const logs = await mongoose.connection.db
      .collection('synclogs')
      .find({ kind: 'catalog' })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    const last = logs[0] || null;
    const mirrorTotal = await BillzProductView.countDocuments({ deletedInBillz: false });

    res.json({
      success: true,
      data: {
        mirrorTotal,
        last: last && {
          at: last.finishedAt,
          ok: last.ok,
          seen: last.seen,
          created: last.created,
          updated: last.updated,
          markedDeleted: last.markedDeleted,
          rejectedReason: last.rejectedReason || '',
          error: last.error || '',
          durationMs: last.durationMs,
        },
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** Asks channel-hub to sync now. The panel never talks to Billz itself. */
exports.triggerSync = async (_req, res) => {
  try {
    const result = await channelHub.request('POST', '/internal/sync');
    if (!result.ok) {
      return res.status(502).json({ success: false, error: 'sync_failed', data: result.body });
    }
    res.json({ success: true, data: result.body });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

/**
 * Marketplace credentials.
 *
 * The keys live in the hub, which is the only process that verifies them. These
 * three handlers are a thin proxy so an operator can issue and revoke from the
 * panel instead of over SSH — the practical effect being that a leaked key gets
 * revoked in the minute somebody notices, rather than whenever the next
 * deployment happens.
 */
exports.listKeys = async (_req, res) => {
  try {
    const result = await channelHub.request('GET', '/internal/keys');
    if (!result.ok) {
      return res.status(502).json({ success: false, error: 'keys_unavailable' });
    }
    res.json({ success: true, data: result.body.keys });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

exports.issueKey = async (req, res) => {
  try {
    const result = await channelHub.request('POST', '/internal/keys', {
      body: {
        channel: req.body?.channel,
        kind: req.body?.kind,
        label: req.body?.label,
      },
    });
    if (!result.ok) {
      return res.status(result.status === 422 ? 400 : 502)
        .json({ success: false, error: result.body?.error || 'issue_failed' });
    }

    console.log(
      `[channels] ${req.admin?.telegramId || 'admin'} issued a ${result.body.channel} `
      + `${result.body.kind} key (${result.body.fingerprint})`
    );
    // The secret travels exactly once, in this response. It is not stored here
    // and cannot be read back from anywhere.
    res.json({ success: true, data: result.body });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

exports.issueKeyPair = async (req, res) => {
  try {
    const result = await channelHub.request('POST', '/internal/keys/pair', {
      body: {
        label: req.body?.label,
        revokeOld: req.body?.revokeOld === true,
      },
    });
    if (!result.ok) {
      return res.status(result.status === 422 ? 400 : 502)
        .json({ success: false, error: result.body?.error || 'pair_issue_failed' });
    }
    console.log(
      `[channels] ${req.admin?.telegramId || 'admin'} issued a Medicalka key pair`
    );
    res.json({ success: true, data: result.body });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

/**
 * The Medicalka wizard's endpoint: catalog token and orders secret issued as
 * one pair, revealed exactly once in this response.
 *
 * Old keys are revoked only when the operator explicitly asked, and only after
 * both new keys exist — a failure halfway through issuance must never leave the
 * integration with zero working credentials.
 */
exports.issueKeyPair = async (req, res) => {
  const label = String(req.body?.label || '').slice(0, 120) || 'Основное подключение';
  const revokeOld = req.body?.revokeOld === true;

  try {
    let previous = [];
    if (revokeOld) {
      const listed = await channelHub.request('GET', '/internal/keys');
      if (listed.ok) {
        previous = (listed.body.keys || []).filter(
          (key) => key.channel === 'medicalka' && key.active
        );
      }
    }

    const tokenResult = await channelHub.request('POST', '/internal/keys', {
      body: { channel: 'medicalka', kind: 'token', label },
    });
    if (!tokenResult.ok) {
      return res.status(502).json({ success: false, error: tokenResult.body?.error || 'issue_failed' });
    }
    const secretResult = await channelHub.request('POST', '/internal/keys', {
      body: { channel: 'medicalka', kind: 'secret', label },
    });
    if (!secretResult.ok) {
      // The catalog token already exists but the pair is incomplete. Withdraw
      // it so a retry starts clean instead of accumulating orphan tokens.
      await channelHub.request('POST', `/internal/keys/${tokenResult.body.id}/revoke`).catch(() => {});
      return res.status(502).json({ success: false, error: secretResult.body?.error || 'issue_failed' });
    }

    let revoked = 0;
    for (const key of previous) {
      const done = await channelHub.request('POST', `/internal/keys/${key.id}/revoke`).catch(() => null);
      if (done?.ok) revoked += 1;
    }

    const adminAudit = require('../services/adminAudit');
    await adminAudit.record({
      admin: req.admin,
      action: 'keys.pair',
      entityType: 'channel-key',
      entityId: tokenResult.body.id,
      // Key names avoid the audit redactor's credential pattern — these are
      // display fingerprints ("mk_ab…12cd"), not usable key material.
      summary: {
        channel: 'medicalka',
        label,
        fingerprints: { catalog: tokenResult.body.fingerprint, orders: secretResult.body.fingerprint },
        revokedOld: revoked,
      },
    });

    console.log(
      `[channels] ${req.admin?.telegramId || 'admin'} issued a medicalka pair `
      + `(${tokenResult.body.fingerprint} / ${secretResult.body.fingerprint})`
      + (revoked ? `, revoked ${revoked} old` : '')
    );

    // The secrets travel exactly once, in this response.
    res.json({
      success: true,
      data: {
        token: tokenResult.body.key,
        secret: secretResult.body.key,
        tokenFingerprint: tokenResult.body.fingerprint,
        secretFingerprint: secretResult.body.fingerprint,
        revokedOld: revoked,
        issuedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

exports.importKey = async (req, res) => {
  try {
    const result = await channelHub.request('POST', '/internal/keys/import', {
      body: {
        channel: req.body?.channel,
        clientId: req.body?.clientId,
        clientSecret: req.body?.clientSecret,
        label: req.body?.label,
      },
    });
    if (!result.ok) {
      const status = result.status === 422 ? 400 : result.status === 409 ? 409 : 502;
      return res.status(status)
        .json({ success: false, error: result.body?.error || 'import_failed' });
    }
    console.log(
      `[channels] ${req.admin?.telegramId || 'admin'} imported ${result.body.channel} `
      + `credentials (${result.body.fingerprint})`
    );
    res.json({ success: true, data: result.body });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

exports.revokeKey = async (req, res) => {
  try {
    const result = await channelHub.request('POST', `/internal/keys/${req.params.id}/revoke`);
    if (!result.ok) {
      return res.status(result.status === 404 ? 404 : 502)
        .json({ success: false, error: result.body?.error || 'revoke_failed' });
    }
    console.warn(
      `[channels] ${req.admin?.telegramId || 'admin'} revoked key ${req.params.id}`
    );
    res.json({ success: true, data: result.body });
  } catch (err) {
    if (err.notConfigured) {
      return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
    }
    sendError(res, 502, err, 'channel_hub_unreachable');
  }
};

exports.getSettings = async (_req, res) => {
  try {
    const doc = await Setting.findOne({ key: DEFAULT_MXIK_KEY }).lean();
    res.json({
      success: true,
      data: {
        defaultMxikCode: doc?.value || '',
        channels: CHANNELS,
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const code = String(req.body?.defaultMxikCode ?? '').trim();
    if (code && !/^\d{6,20}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'invalid_mxik' });
    }
    await Setting.updateOne(
      { key: DEFAULT_MXIK_KEY },
      { $set: { key: DEFAULT_MXIK_KEY, value: code } },
      { upsert: true }
    );
    res.json({ success: true, data: { defaultMxikCode: code } });
  } catch (err) {
    sendError(res, 400, err);
  }
};

exports.CHANNELS = CHANNELS;
exports.availability = availability;
exports.serialise = serialise;
exports.POST_JOIN_FILTERS = POST_JOIN_FILTERS;
