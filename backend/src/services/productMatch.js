/**
 * Cross-platform product-match quality.
 *
 * Each provider scraper returns its own "first result", which may not be the
 * same product across platforms (e.g. Amul Gold on one, Godrej on another).
 * This module scores how well each result matches the user's query so the UI
 * can flag low-confidence matches and the recommendation can prefer high ones.
 *
 * It is intentionally heuristic and dependency-free: tokenize the query and
 * the product title, measure token coverage, brand agreement, and pack-size
 * presence, and produce a 0..1 confidence plus a normalized size in a base
 * unit (grams / millilitres / pieces) for fair comparison.
 */

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'pack', 'combo']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9%.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Parse a size like "1 kg", "500 ml", "6 x 100 g", "1 L" -> base units.
function parseSize(text) {
  const s = String(text || '').toLowerCase();
  // multiplier form: "6 x 100 g"
  const mult = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|l|ltr|litre|liter|ml)/);
  let count = 1;
  let value = null;
  let unit = null;
  if (mult) {
    count = parseInt(mult[1], 10) || 1;
    value = parseFloat(mult[2]);
    unit = mult[3];
  } else {
    const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|l|ltr|litre|liter|ml)\b/);
    if (single) {
      value = parseFloat(single[1]);
      unit = single[2];
    }
  }
  if (value == null || unit == null) return null;

  let base;
  let kind;
  if (unit === 'kg') { base = value * 1000; kind = 'mass'; }
  else if (unit === 'g' || unit === 'gram' || unit === 'grams') { base = value; kind = 'mass'; }
  else if (unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'liter') { base = value * 1000; kind = 'volume'; }
  else if (unit === 'ml') { base = value; kind = 'volume'; }
  else return null;

  return { base: base * count, kind };
}

/**
 * matchConfidence(query, title, quantity) -> { confidence: 0..1, brandMatch, size }
 */
function matchConfidence(query, title, quantity) {
  const qTokens = tokenize(query);
  const tTokens = new Set(tokenize(title));
  if (qTokens.length === 0) return { confidence: 0, brandMatch: false, size: null };

  let hit = 0;
  for (const q of qTokens) {
    if (tTokens.has(q)) hit += 1;
    else if ([...tTokens].some((t) => t.startsWith(q) || q.startsWith(t))) hit += 0.5;
  }
  const coverage = hit / qTokens.length;

  // Brand agreement: assume the first query token is (often) the brand.
  const brandMatch = tTokens.has(qTokens[0]);

  const size = parseSize(quantity) || parseSize(title);

  // Confidence: coverage dominates, small bonus for brand + known size.
  let confidence = coverage;
  if (brandMatch) confidence = Math.min(1, confidence + 0.1);
  if (size) confidence = Math.min(1, confidence + 0.05);

  return {
    confidence: Math.round(confidence * 100) / 100,
    brandMatch,
    size,
  };
}

function confidenceLabel(confidence) {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

module.exports = { matchConfidence, confidenceLabel, parseSize, tokenize };
