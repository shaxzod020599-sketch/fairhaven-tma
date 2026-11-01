/**
 * What anyone without an admin session may see of a product.
 *
 * A product document also carries ERP and marketplace plumbing: the Billz
 * link, per-channel prices, stock floors and overrides, tax codes, the
 * approval and auto-stock flags. The public endpoints used to return the
 * whole document, so all of it was readable at /api/products. They now go
 * through this whitelist; admin endpoints keep the full document.
 */
const { resolveBrand } = require('./catalog/brands');
const { formatTitle, formatTitleUz, formatSpec } = require('./catalog/displayName');
const { classify, NEED_KEYS, KIND_KEYS } = require('./catalog/taxonomy');

// Only an explicit `approved: false` hides a product. The field is absent on
// products created before approval existed, and those must stay listed.
const LISTED = { approved: { $ne: false } };

// Stored fields the public site (web/) and the mini-app (frontend/) read.
// `sku` is printed on the web product page.
const STORED_FIELDS = [
  '_id',
  'name',
  'nameUz',
  'price',
  'oldPrice',
  'category',
  'imageUrl',
  'images',
  'description',
  'descriptionUz',
  'descriptionUzLat',
  'isAvailable',
  'brand',
  'sku',
  'tags',
];

// Shop-floor fields derived from the raw name and brand. `needs` and `kind`
// share their names with the admin overrides they are computed from.
const COMPUTED_FIELDS = ['title', 'titleUz', 'spec', 'specUz', 'brandName', 'brandSlug', 'needs', 'kind'];

// Admin overrides read to compute the fields above; not published as such.
const OVERRIDE_FIELDS = ['displayName', 'displayNameUz', 'needs', 'kind'];

// Every key a public product object may carry.
const PUBLIC_FIELDS = [...STORED_FIELDS, ...COMPUTED_FIELDS.filter((f) => !STORED_FIELDS.includes(f))];

const SELECT_FIELDS = [...new Set([...STORED_FIELDS, ...OVERRIDE_FIELDS])];
const PUBLIC_SELECT = SELECT_FIELDS.join(' ');
const PUBLIC_PROJECTION = Object.fromEntries(SELECT_FIELDS.map((field) => [field, 1]));

/** The automatic values, before admin overrides. Also shown as hints in the admin form. */
function autoCatalog(product) {
  const brand = resolveBrand(product);
  const { needs, kind } = classify(product);
  return {
    title: formatTitle(product?.name, product?.brand),
    titleUz: formatTitleUz(product?.nameUz, product?.brand),
    spec: formatSpec(product?.name, product?.brand),
    specUz: formatSpec(product?.name, product?.brand, 'uz'),
    brandName: brand.name,
    brandSlug: brand.slug,
    needs,
    kind,
  };
}

/** Catalogue fields with the admin's stored values taking precedence. */
function catalogFields(product) {
  const auto = autoCatalog(product);
  const storedNeeds = Array.isArray(product?.needs)
    ? NEED_KEYS.filter((key) => product.needs.includes(key))
    : [];
  return {
    ...auto,
    title: String(product?.displayName || '').trim() || auto.title,
    titleUz: String(product?.displayNameUz || '').trim() || auto.titleUz,
    needs: storedNeeds.length ? storedNeeds : auto.needs,
    kind: KIND_KEYS.includes(product?.kind) ? product.kind : auto.kind,
  };
}

/** A lean product (or document) reduced to its public shape. */
function toPublicProduct(product) {
  if (!product) return product;
  const source = typeof product.toObject === 'function' ? product.toObject({ virtuals: false }) : product;
  const out = {};
  for (const field of STORED_FIELDS) if (source[field] !== undefined) out[field] = source[field];
  return { ...out, ...catalogFields(source) };
}

module.exports = {
  LISTED,
  PUBLIC_FIELDS,
  COMPUTED_FIELDS,
  PUBLIC_SELECT,
  PUBLIC_PROJECTION,
  autoCatalog,
  catalogFields,
  toPublicProduct,
};
