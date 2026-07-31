/**
 * Matches Fairhaven product cards to Billz catalogue entries.
 *
 * Barcodes and article numbers are decisive when present. Names are not: the
 * same product is written "Fairhaven MotilityBoost, №60" in Billz and
 * "Motility Boost for Men" on the card. So names are compared as normalised
 * token sets, with two hard guards that matter more than the score:
 *
 *   - a conflicting gender ("for Men" vs "for Women") is never a match;
 *   - a conflicting pack size (№60 vs №120) is never a match.
 *
 * Both mistakes would silently sell the wrong stock, so they reject outright
 * rather than lowering a score. Anything else below the confidence threshold,
 * or too close to a runner-up, is reported for a human instead of linked.
 */

// Packaging and dosage words appear in almost every name and identify nothing.
const NOISE = new Set([
  'таб', 'табл', 'таблеток', 'таблетки', 'таблетка',
  'капс', 'капсул', 'капсулы', 'капсула',
  'шт', 'штук', 'дона', 'уп', 'упаковка', 'пар', 'пара',
  'мг', 'мкг', 'г', 'гр', 'мл', 'ml', 'mg', 'mcg', 'iu', 'ме',
  'для', 'and', 'for', 'the', 'with',
  // Brand words: present on nearly every Billz row, absent on many cards.
  'fairhaven', 'fh',
]);

const GENDER = {
  men: 'men', man: 'men', male: 'men', мужчин: 'men', мужской: 'men',
  women: 'women', woman: 'women', female: 'women', женщин: 'women', женский: 'women',
};

function splitCompounds(text) {
  // "MotilityBoost" -> "Motility Boost"; "CountBoost" -> "Count Boost".
  // Billz writes these closed up while the shop cards space them out.
  return text.replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2');
}

function normalise(raw) {
  return splitCompounds(String(raw || ''))
    .toLowerCase()
    .replace(/[№#]/g, ' ')
    .replace(/[’'`®™]/g, '')
    // Digits stay: "120" vs "60" is the difference between two real products.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenise(raw) {
  return normalise(raw).split(' ').filter((t) => t && !NOISE.has(t));
}

function genderOf(tokens) {
  for (const token of tokens) if (GENDER[token]) return GENDER[token];
  return null;
}

function packSizes(tokens) {
  // Two-digit and larger numbers are pack counts; a lone "1" or "3" is noise.
  return tokens.filter((t) => /^\d+$/.test(t) && Number(t) >= 10);
}

/**
 * 0..1 similarity. Returns 0 for a conflicting gender or pack size, which is a
 * rejection rather than a low score.
 */
function similarity(a, b) {
  const leftTokens = tokenise(a);
  const rightTokens = tokenise(b);
  if (!leftTokens.length || !rightTokens.length) return 0;

  const leftGender = genderOf(leftTokens);
  const rightGender = genderOf(rightTokens);
  if (leftGender && rightGender && leftGender !== rightGender) return 0;

  const leftPacks = packSizes(leftTokens);
  const rightPacks = packSizes(rightTokens);
  if (leftPacks.length && rightPacks.length
    && !leftPacks.some((n) => rightPacks.includes(n))) return 0;

  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  let score = (2 * shared) / (left.size + right.size);

  // A matching gender or pack size is real evidence, not incidental overlap.
  if (leftGender && rightGender) score += 0.1;
  if (leftPacks.length && rightPacks.length) score += 0.1;

  return Math.min(1, score);
}

const CONFIDENT = 0.6;
const AMBIGUITY_MARGIN = 0.08;

/**
 * Proposes a Billz entry for one product card, or null.
 * `method` records why, so a report can be read without re-running the compare.
 */
function proposeMatch(product, billzProducts, { taken = new Set() } = {}) {
  const available = billzProducts.filter((b) => !taken.has(b.billzProductId));

  const barcode = String(product.barcode || '').trim();
  if (barcode) {
    const hit = available.find((b) => String(b.barcode || '').trim() === barcode);
    if (hit) return { billzProductId: hit.billzProductId, method: 'barcode', score: 1, candidate: hit };
  }

  const sku = String(product.sku || '').trim().toLowerCase();
  if (sku) {
    const hit = available.find((b) => String(b.sku || '').trim().toLowerCase() === sku);
    if (hit) return { billzProductId: hit.billzProductId, method: 'sku', score: 1, candidate: hit };
  }

  const scored = available
    .map((candidate) => ({ candidate, score: similarity(product.name, candidate.name) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < CONFIDENT) return null;

  // A near-tie means the name does not identify the product; either choice
  // would be a guess, and a guess here sells the wrong stock.
  const runnerUp = scored[1]?.score || 0;
  if (best.score - runnerUp < AMBIGUITY_MARGIN) {
    return {
      billzProductId: null,
      method: 'ambiguous',
      score: Number(best.score.toFixed(3)),
      candidate: best.candidate,
      rival: scored[1]?.candidate || null,
    };
  }

  return {
    billzProductId: best.candidate.billzProductId,
    method: 'name',
    score: Number(best.score.toFixed(3)),
    candidate: best.candidate,
  };
}

/**
 * Matches a whole catalogue.
 *
 * One Billz product backs at most one card — two cards sharing it would each
 * sell the same stock without knowing about the other. Identifier matches claim
 * their target first so a weaker name match cannot steal it.
 */
function matchCatalogue(products, billzProducts) {
  const taken = new Set(products.map((p) => p.billzProductId).filter(Boolean));
  const pending = products.filter((p) => !p.billzProductId);

  const matched = [];
  const ambiguous = [];
  const done = new Set();

  for (const pass of ['id', 'name']) {
    for (const product of pending) {
      if (done.has(String(product._id))) continue;
      const proposal = proposeMatch(product, billzProducts, { taken });
      if (!proposal) continue;

      if (proposal.method === 'ambiguous') {
        if (pass === 'name') {
          ambiguous.push({ product, ...proposal });
          done.add(String(product._id));
        }
        continue;
      }
      const isIdMatch = proposal.method !== 'name';
      if (pass === 'id' && !isIdMatch) continue;

      taken.add(proposal.billzProductId);
      matched.push({ product, ...proposal });
      done.add(String(product._id));
    }
  }

  const unmatched = pending.filter((p) => !done.has(String(p._id)));
  return { matched, ambiguous, unmatched };
}

module.exports = {
  normalise,
  tokenise,
  similarity,
  proposeMatch,
  matchCatalogue,
  CONFIDENT,
};
