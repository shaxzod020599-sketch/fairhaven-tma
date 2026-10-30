/**
 * What anyone without an admin session may see of a product.
 *
 * A product document also carries ERP and marketplace plumbing: the Billz
 * link, per-channel prices, stock floors and overrides, tax codes, the
 * approval and auto-stock flags. The public endpoints used to return the
 * whole document, so all of it was readable at /api/products. They now go
 * through this whitelist; admin endpoints keep the full document.
 */

// Only an explicit `approved: false` hides a product. The field is absent on
// products created before approval existed, and those must stay listed.
const LISTED = { approved: { $ne: false } };

// Exactly what the public site (web/) and the mini-app (frontend/) read.
// `sku` is printed on the web product page.
const PUBLIC_FIELDS = [
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

const PUBLIC_SELECT = PUBLIC_FIELDS.join(' ');
const PUBLIC_PROJECTION = Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, 1]));

module.exports = { LISTED, PUBLIC_FIELDS, PUBLIC_SELECT, PUBLIC_PROJECTION };
