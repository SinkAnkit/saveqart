/**
 * Shared ad/sponsored product detection for scraper adapters.
 *
 * Checks three signals:
 *  1. Explicit "AD" / "SPONSORED" / "PROMOTED" labels in the card text.
 *  2. Zero query-token overlap with the product name (likely irrelevant placement).
 *
 * Each adapter can pass just `productName + query` (simple) or add the full
 * `cardText` for richer label detection (Blinkit, Flipkart).
 */

/**
 * @param {object} opts
 * @param {string} opts.productName - Title of the product as scraped.
 * @param {string} opts.query - User's original search term.
 * @param {string} [opts.cardText] - Full raw innerText of the card element (optional).
 * @returns {boolean} true if the product looks like a paid ad rather than an organic result.
 */
function isAdResult({ productName, query, cardText }) {
  // Signal 1: explicit sponsorship labels in full card text.
  if (cardText) {
    const upper = cardText.toUpperCase();
    if (upper.includes('SPONSORED') || upper.includes('PROMOTED')) return true;

    // Standalone "AD" that isn't part of "ADD" (Blinkit's add-to-cart button).
    if (/\bAD\b/.test(upper) && !upper.includes('ADD')) {
      const lines = cardText.split('\n').map((l) => l.trim());
      if (lines.some((l) => /^AD$/i.test(l))) return true;
    }
  }

  // Signal 2: the product name shares no meaningful token with the query.
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTokens.length > 0 && productName) {
    const nameLower = productName.toLowerCase();
    const matchCount = queryTokens.filter((t) => nameLower.includes(t)).length;
    if (matchCount === 0) return true;
  }

  return false;
}

module.exports = { isAdResult };
