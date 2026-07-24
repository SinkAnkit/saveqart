const { createCache } = require('../utils/cache');

const OPEN_PRICES_BASE =
  process.env.OPEN_PRICES_BASE || 'https://prices.openfoodfacts.org';
const USER_AGENT =
  process.env.OPEN_PRICES_USER_AGENT || 'SaveQart/1.0 (https://saveqart.local)';

const cache = createCache({ maxSize: 500, ttlMs: 30 * 60 * 1000 });

function buildUrl(path, params = {}) {
  const url = new URL(path, OPEN_PRICES_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

async function requestJson(path, params = {}) {
  const res = await fetch(buildUrl(path, params), {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Prices ${res.status}`);
  return res.json();
}

function extractList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.prices)) return payload.prices;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.results)) return payload.data.results;
  return [];
}

function pickNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function mapObservation(raw) {
  const amount = pickNumber(
    raw.price,
    raw.price_with_discount,
    raw.amount,
    raw.value
  );

  if (amount == null) return null;

  const currency = pickString(
    raw.currency,
    raw.currency_code,
    raw.location?.currency
  ) || 'INR';

  const observedAt = pickString(
    raw.date,
    raw.price_date,
    raw.created_at,
    raw.created,
    raw.proof?.date
  );

  const locationLabel = pickString(
    raw.location_name,
    raw.location?.name,
    raw.location?.display_name,
    raw.location?.osm_name,
    raw.shop_name,
    raw.store_name
  );

  const proofUrl = pickString(
    raw.proof_url,
    raw.proof?.image_url,
    raw.proof?.url,
    raw.receipt_image_url
  );

  return {
    id: raw.id || proofUrl || `${currency}:${amount}:${observedAt || 'na'}`,
    amount,
    currency,
    observedAt,
    locationLabel,
    proofUrl,
    sourceUrl: pickString(raw.url, raw.product_url),
  };
}

function summarize(observations) {
  if (observations.length === 0) return null;

  const currencies = Array.from(new Set(observations.map((item) => item.currency)));
  const ordered = [...observations].sort((a, b) => {
    const aTime = a.observedAt ? new Date(a.observedAt).getTime() : 0;
    const bTime = b.observedAt ? new Date(b.observedAt).getTime() : 0;
    return bTime - aTime;
  });

  const summary = {
    currencies,
    latestSeenAt: ordered[0]?.observedAt || null,
    observationCount: observations.length,
  };

  if (currencies.length === 1) {
    const amounts = observations.map((item) => item.amount);
    summary.currency = currencies[0];
    summary.lowestPrice = Math.min(...amounts);
    summary.highestPrice = Math.max(...amounts);
  }

  return summary;
}

async function fetchObservedPrices(productCode) {
  const code = String(productCode || '').trim();
  if (!code) {
    return {
      observations: [],
      summary: null,
    };
  }

  const cached = cache.get(code);
  if (cached) return cached;

  const product = await requestJson(`/api/v1/products/code/${encodeURIComponent(code)}`);

  const candidates = [
    { path: '/api/v1/prices', params: { product_code: code, size: 6 } },
    { path: '/api/v1/prices', params: { product_code: code, page_size: 6 } },
  ];

  if (product && product.id != null) {
    candidates.push({ path: '/api/v1/prices', params: { product: product.id, size: 6 } });
  }

  let entries = extractList(product);
  if (entries.length === 0) {
    for (const candidate of candidates) {
      const payload = await requestJson(candidate.path, candidate.params);
      entries = extractList(payload);
      if (entries.length > 0) break;
    }
  }

  const observations = entries
    .map(mapObservation)
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a.observedAt ? new Date(a.observedAt).getTime() : 0;
      const bTime = b.observedAt ? new Date(b.observedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 6);

  const intel = {
    observations,
    summary: summarize(observations),
  };

  cache.set(code, intel);
  return intel;
}

module.exports = {
  fetchObservedPrices,
};
