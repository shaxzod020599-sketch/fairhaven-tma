const ExcelJS = require('exceljs');
const multer = require('multer');
const Product = require('../models/Product');
const BillzProductView = require('../models/BillzProductView');
const { sendError } = require('../utils/http');

// Exported exactly as written back. The two Billz columns are read-only on
// import — `billzStock` is the live mirror and `billzProductId` is owned by the
// linking endpoint — so they appear here for the operator to see, but the
// import path ignores both.
const EXPORT_COLUMNS = [
  { header: '_id', key: '_id', width: 26 },
  { header: 'sku', key: 'sku', width: 18 },
  { header: 'name', key: 'name', width: 34 },
  { header: 'nameUz', key: 'nameUz', width: 24 },
  { header: 'brand', key: 'brand', width: 20 },
  { header: 'category', key: 'category', width: 20 },
  { header: 'price', key: 'price', width: 12 },
  { header: 'oldPrice', key: 'oldPrice', width: 12 },
  { header: 'isAvailable', key: 'isAvailable', width: 13 },
  { header: 'billzProductId', key: 'billzProductId', width: 22 },
  { header: 'billzStock', key: 'billzStock', width: 12 },
];

/**
 * Streams a full products workbook. Stock is joined from the Billz mirror by
 * `billzProductId` so the operator sees what each linked card actually has on
 * the shelf — but that value never flows back in (see importProducts).
 */
exports.exportProducts = async (req, res) => {
  try {
    const products = await Product.find({}).lean();
    const linkedIds = products.map((p) => p.billzProductId).filter(Boolean);
    const stockDocs = linkedIds.length
      ? await BillzProductView.find({ billzProductId: { $in: linkedIds } })
      : [];
    const stockByBillz = new Map();
    for (const s of stockDocs) stockByBillz.set(s.billzProductId, Number(s.stock) || 0);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.columns = EXPORT_COLUMNS;
    for (const p of products) {
      ws.addRow({
        _id: String(p._id),
        sku: p.sku || '',
        name: p.name || '',
        nameUz: p.nameUz || '',
        brand: p.brand || '',
        category: p.category || '',
        price: Number(p.price) || 0,
        oldPrice: Number(p.oldPrice) || 0,
        isAvailable: p.isAvailable !== false,
        billzProductId: p.billzProductId || '',
        billzStock: p.billzProductId ? (stockByBillz.get(p.billzProductId) ?? '') : '',
      });
    }
    ws.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
    await wb.xlsx.write(res);
  } catch (err) {
    sendError(res, 500, err);
  }
};

// ── Import ──────────────────────────────────────────────────────────────────

// memoryStorage: nothing is written to disk. 5 MB cap and an .xlsx-only filter
// keep this bounded; the workbook is parsed straight from the buffer.
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || /\.xlsx$/i.test(file.originalname);
    cb(null, Boolean(ok));
  },
}).single('file');

const VALID_CATEGORIES = [
  'cosmetics', 'parapharmaceuticals', 'supplements', 'vitamins', 'hygiene', 'drinks',
];

/** Flatten an exceljs cell value to a plain string (handles richText/formula). */
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v.richText) return (v.text || v.richText.map((r) => r.text).join(''));
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}

/** Coerce a cell to a number; NaN when it can't. */
function cellNum(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(cellText(v).replace(/\s/g, '').replace(',', '.'));
  return n;
}

/**
 * isAvailable is the one field an operator flips by hand at scale, and Excel
 * stores it in several shapes. Empty cell → {empty}; recognized truthy/falsy →
 * {value}; anything else → {invalid} (the row is rejected).
 */
function parseAvail(v) {
  if (v == null) return { empty: true };
  const s = cellText(v).trim().toLowerCase();
  if (s === '') return { empty: true };
  if (['true', '1', 'да', 'yes', '+'].includes(s)) return { value: true };
  if (['false', '0', 'нет', 'no', '-'].includes(s)) return { value: false };
  return { invalid: true };
}

/**
 * Parse + (optionally) apply an uploaded workbook.
 *
 * `apply=1` only takes effect when there are zero invalid rows: a single bad
 * row blocks the whole batch rather than partially applying. Nothing is ever
 * deleted — this is edit/create only.
 */
exports.importProducts = (req, res) => {
  importUpload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const code = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload_failed';
        return res.status(400).json({ success: false, error: code });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'file_required' });
      }

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        return res.status(400).json({ success: false, error: 'empty_sheet' });
      }

      // Build a header-name → column-number map so column order is not load-bearing.
      const colIndex = {};
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const h = cellText(cell.value).trim().toLowerCase();
        if (h) colIndex[h] = colNumber;
      });
      const cell = (row, field) => {
        const col = colIndex[field.toLowerCase()];
        return col ? row.getCell(col).value : undefined;
      };

      // Existing products, keyed two ways: ObjectId (primary) and sku (fallback).
      const products = await Product.find({}).lean();
      const byId = new Map();
      const bySku = new Map();
      for (const p of products) {
        byId.set(String(p._id), p);
        const sk = (p.sku || '').trim().toLowerCase();
        if (sk) bySku.set(sk, p);
      }

      const toCreate = [];      // { row, name, price }
      const createBodies = [];   // aligned with toCreate
      const toUpdate = [];      // { _id, name, changes:{field:{old,new}} }
      const updateOps = [];     // aligned with toUpdate: { _id, set }
      const invalid = [];       // { row, reason }
      let unchangedCount = 0;

      const lastRow = ws.actualRowCount || ws.rowCount;
      for (let r = 2; r <= lastRow; r++) {
        const row = ws.getRow(r);
        const rawId = cellText(cell(row, '_id')).trim();
        const rawSku = cellText(cell(row, 'sku')).trim();
        const rawName = cellText(cell(row, 'name')).trim();
        const nameUz = cellText(cell(row, 'nameUz')).trim();
        const brand = cellText(cell(row, 'brand')).trim();
        const catRaw = cellText(cell(row, 'category')).trim();
        const price = cellNum(cell(row, 'price'));
        const oldPriceRaw = cellNum(cell(row, 'oldPrice'));
        const avail = parseAvail(cell(row, 'isAvailable'));

        const isEmpty = !rawId && !rawSku && !rawName
          && Number.isNaN(price) && avail.empty;
        if (isEmpty) continue;

        // Validation — name, price, isAvailable. Anything else is optional.
        const errs = [];
        if (!rawName) errs.push('пустое название');
        if (!Number.isFinite(price) || price <= 0) errs.push('цена должна быть положительным числом');
        if (avail.invalid) errs.push('isAvailable должен быть true/false/1/0/да/нет');
        if (errs.length) {
          invalid.push({ row: r, reason: errs.join('; ') });
          continue;
        }

        // Match: _id first, then sku. billzProductId/billzStock are never used
        // for matching or mutation.
        let product = null;
        if (rawId) product = byId.get(rawId) || null;
        if (!product && rawSku) product = bySku.get(rawSku.toLowerCase()) || null;

        const oldPrice = Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? oldPriceRaw : 0;
        const category = VALID_CATEGORIES.includes(catRaw) ? catRaw : 'supplements';

        if (!product) {
          toCreate.push({ row: r, name: rawName, price });
          const body = {
            name: rawName,
            price,
            category,
            oldPrice,
            isAvailable: avail.empty ? true : avail.value,
          };
          if (rawSku) body.sku = rawSku;
          if (nameUz) body.nameUz = nameUz;
          if (brand) body.brand = brand;
          createBodies.push(body);
          continue;
        }

        // Update: diff field-by-field. Only changed fields go into the $set.
        const changes = {};
        const setStr = (field, newVal, oldVal) => {
          const o = oldVal || '';
          if (newVal !== o) changes[field] = { old: o, new: newVal };
        };
        const setNum = (field, newVal, oldVal) => {
          const o = Number(oldVal) || 0;
          if (newVal !== o) changes[field] = { old: o, new: newVal };
        };

        setStr('name', rawName, product.name);
        setStr('nameUz', nameUz, product.nameUz);
        setStr('brand', brand, product.brand);
        if (catRaw) setStr('category', category, product.category);
        setNum('price', price, product.price);
        setNum('oldPrice', oldPrice, product.oldPrice);
        if (!avail.empty) {
          const cur = product.isAvailable !== false;
          if (avail.value !== cur) changes.isAvailable = { old: cur, new: avail.value };
        }

        if (Object.keys(changes).length === 0) {
          unchangedCount += 1;
          continue;
        }

        const set = {};
        for (const [f, c] of Object.entries(changes)) set[f] = c.new;
        // A hand-set availability pins the product to manual, exactly as the
        // single-card editor does — otherwise the stock reconciler hands it
        // back to Billz and silently undoes this within minutes.
        if (set.isAvailable !== undefined) set.autoStock = false;
        toUpdate.push({ _id: String(product._id), name: rawName, changes });
        updateOps.push({ _id: product._id, set });
      }

      const wantApply = req.query.apply === '1';
      let applied = false;
      if (wantApply && invalid.length === 0) {
        for (const op of updateOps) {
          if (op.set && Object.keys(op.set).length) {
            await Product.updateOne({ _id: op._id }, { $set: op.set });
          }
        }
        for (const body of createBodies) {
          await Product.create(body);
        }
        applied = true;
        await require('../services/adminAudit').record({
          admin: req.admin,
          action: 'excel.apply',
          entityType: 'product',
          summary: {
            created: toCreate.length,
            updated: toUpdate.length,
            unchanged: unchangedCount,
            file: req.file.originalname,
          },
        });
      }

      res.json({
        success: true,
        data: {
          report: { toCreate, toUpdate, invalid, unchangedCount },
          applied,
        },
      });
    } catch (err) {
      sendError(res, 500, err);
    }
  });
};
