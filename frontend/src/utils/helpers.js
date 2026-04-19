/**
 * Format number as UZS currency
 * @param {number} amount
 * @returns {string} e.g. "150 000 UZS"
 */
export function formatPrice(amount) {
  if (!amount && amount !== 0) return '0 UZS';
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

/**
 * Category metadata with icons and labels
 */
export const CATEGORIES = [
  { key: 'cosmetics', label: 'Косметика', icon: '💄' },
  { key: 'parapharmaceuticals', label: 'Парафармация', icon: '🏥' },
  { key: 'supplements', label: 'Добавки', icon: '💊' },
  { key: 'vitamins', label: 'Витамины', icon: '🌿' },
  { key: 'hygiene', label: 'Гигиена', icon: '🧴' },
  { key: 'drinks', label: 'Напитки', icon: '🥤' },
];

/**
 * Get category display info
 * @param {string} key
 * @returns {{ label: string, icon: string }}
 */
export function getCategoryInfo(key) {
  return CATEGORIES.find(c => c.key === key) || { label: key, icon: '📦' };
}

/**
 * Product icon fallback based on category
 * @param {string} category
 * @returns {string} emoji
 */
export function getProductIcon(category) {
  const icons = {
    cosmetics: '💄',
    parapharmaceuticals: '🩺',
    supplements: '💊',
    vitamins: '🌿',
    hygiene: '🧴',
    drinks: '🥤',
  };
  return icons[category] || '📦';
}

/**
 * Debounce utility
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
