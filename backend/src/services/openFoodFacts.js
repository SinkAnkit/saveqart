const { createCache } = require('../utils/cache');

const OPEN_FOOD_FACTS_BASE =
  process.env.OPEN_FOOD_FACTS_BASE || 'https://world.openfoodfacts.org';
const USER_AGENT =
  process.env.OPEN_FOOD_FACTS_USER_AGENT || 'SaveQart/1.0 (Contact: support@saveqart.local)';

const cache = createCache({ maxSize: 500, ttlMs: 30 * 60 * 1000 });

function tokenize(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreProduct(product, queryTokens) {
  const phrase = queryTokens.join(' ');
  const primaryText = [
    product.product_name,
    product.product_name_en,
    product.generic_name,
    product.generic_name_en,
    product.brands,
  ]
    .filter(Boolean)
    .join(' ');
  const supportText = [product.categories].filter(Boolean).join(' ');

  const haystack = tokenize(
    primaryText
  );
  const supportHaystack = tokenize(supportText);

  if (haystack.length === 0) return { coverage: 0, primaryCoverage: 0, score: 0 };

  let matchedTokens = 0;
  let prefixMatches = 0;
  let supportMatches = 0;
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matchedTokens += 1;
      score += 5;
    } else if (haystack.some((word) => word.startsWith(token))) {
      prefixMatches += 1;
      score += 2;
    } else if (supportHaystack.includes(token)) {
      supportMatches += 1;
      score += 1;
    } else {
      score -= 4;
    }
  }

  const primaryCoverage = (matchedTokens + prefixMatches * 0.5) / Math.max(queryTokens.length, 1);
  const coverage =
    (matchedTokens + prefixMatches * 0.5 + supportMatches * 0.25) /
    Math.max(queryTokens.length, 1);

  if (primaryText.toLowerCase().includes(phrase)) score += 8;
  if (matchedTokens === queryTokens.length) score += 6;

  if (product.image_front_url || product.image_url) score += 1;
  if (product.quantity) score += 1;
  if (product.brands) score += 1;

  return { coverage, primaryCoverage, score };
}

function formatCategory(tag) {
  return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

function mapProduct(product) {
  const productName =
    product.product_name ||
    product.product_name_en ||
    product.generic_name ||
    product.generic_name_en ||
    null;

  if (!product.code || !productName) return null;

  return {
    code: product.code,
    name: productName,
    brand: product.brands || null,
    imageUrl: product.image_front_url || product.image_url || null,
    quantity: product.quantity || null,
    ingredientsText:
      product.ingredients_text_en || product.ingredients_text || null,
    categories: Array.isArray(product.categories_tags)
      ? product.categories_tags.slice(0, 4).map(formatCategory)
      : [],
    url: `https://world.openfoodfacts.org/product/${product.code}`,
  };
}

async function searchProductCatalog(query, retries = 2) {
  const q = (query || '').trim();
  if (!q) return null;

  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const url = new URL('/cgi/search.pl', OPEN_FOOD_FACTS_BASE);
  url.searchParams.set('action', 'process');
  url.searchParams.set('fields', [
    'brands',
    'categories',
    'categories_tags',
    'code',
    'generic_name',
    'generic_name_en',
    'image_front_url',
    'image_url',
    'ingredients_text',
    'ingredients_text_en',
    'product_name',
    'product_name_en',
    'quantity',
  ].join(','));
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('search_terms', q);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
  } catch (err) {
    if (retries > 0) return searchProductCatalog(query, retries - 1);
    throw err;
  }

  if (!res.ok) {
    if (retries > 0) return searchProductCatalog(query, retries - 1);
    throw new Error(`Open Food Facts ${res.status}`);
  }

  const payload = await res.json();
  const products = Array.isArray(payload.products) ? payload.products : [];
  const queryTokens = tokenize(q);

  const best = products
    .map((product) => {
      const ranking = scoreProduct(product, queryTokens);
      return { product, ...ranking };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  const mapped =
    best && best.coverage >= 0.6 && best.primaryCoverage >= 0.5
      ? mapProduct(best.product)
      : null;
  cache.set(cacheKey, mapped);
  return mapped;
}

module.exports = {
  searchProductCatalog,
};
