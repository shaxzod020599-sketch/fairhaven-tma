/** A sentence that ends in «{hours}.»: with the hours filled in, or cut back to the part before them when settings have none. */
export function withHours(tf, key, hours) {
  return hours ? tf(key, { hours }) : tf(key, { hours: '' }).replace(/\s*\.$/, '').trim();
}
