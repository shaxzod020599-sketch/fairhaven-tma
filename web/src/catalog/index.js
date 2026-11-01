export { CatalogProvider, useCatalog, useProducts, useProduct, useTaxonomy } from './CatalogProvider.jsx';
export { normalizeProduct, productTitle, productSpec, brandCountry } from './normalize.js';
export { NEED_KEYS, KIND_KEYS, LEGACY_STAGES, isNeed, isKind, needFromSlug } from './taxonomy.js';
export { BRANDS, brandBySlug } from './brands.js';
export { PAGE_SIZE, SORTS, normalizeFilter, filterProducts, facetCounts, sortProducts, paginate, savingsShelf } from './query.js';
export { searchProducts, fold } from './search.js';
export { formatSum, percentOff } from './format.js';
