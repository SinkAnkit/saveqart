const { reverseGeocode } = require('../services/locationIntel');
const { searchProductCatalog } = require('../services/openFoodFacts');
const { fetchObservedPrices } = require('../services/openPrices');
const { checkServiceability } = require('../services/serviceability');
const { matchConfidence, confidenceLabel } = require('../services/productMatch');
const { createLimiter } = require('./adapters/browser');
const { fetchFirstResult: fetchGenericResult } = require('./adapters/generic');
const { fetchFirstResult: fetchBlinkitResult } = require('./adapters/blinkit');
const { fetchFirstResult: fetchZeptoResult } = require('./adapters/zepto');
const { fetchFirstResult: fetchBigBasketResult } = require('./adapters/bigbasket');
const { fetchFirstResult: fetchFlipkartResult } = require('./adapters/flipkart');
const { fetchFirstResult: fetchAmazonFreshResult } = require('./adapters/amazon_fresh');
const { fetchFirstResult: fetchStarQuikResult } = require('./adapters/starquik');

// Cap simultaneous scrapes so shared-browser pages don't starve each other
// (the root cause of intermittent not_found). Configurable via env.
const scrapeLimit = createLimiter(Number(process.env.SCRAPE_CONCURRENCY || 3));

// On free-tier hosting (low CPU), shorten the overall per-provider timeout
// so the search doesn't hang for 2+ minutes. Providers that can't respond
// in time simply report "not_found" and the user gets their deep-link.
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 20000);

const PROVIDERS = [
  { id: 'blinkit', name: 'Blinkit', color: '#F8CB46', searchUrl: (query) => `https://blinkit.com/s/?q=${encodeURIComponent(query)}` },
  { id: 'zepto', name: 'Zepto', color: '#7C3AED', searchUrl: (query) => `https://www.zeptonow.com/search?query=${encodeURIComponent(query)}` },
  { id: 'bbnow', name: 'BigBasket Now', color: '#A4C73C', searchUrl: (query) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}` },
  { id: 'flipkart_minutes', name: 'Flipkart Minutes', color: '#E11D74', searchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}` },
  { id: 'amazon_fresh', name: 'Amazon Fresh', color: '#FF9900', searchUrl: (query) => `https://www.amazon.in/s?k=${encodeURIComponent(query)}&i=nowstore` },
  { id: 'starquik', name: 'StarQuik', color: '#E53935', searchUrl: (query) => `https://www.starquik.com/search?q=${encodeURIComponent(query)}` },
];

const ADAPTERS = {
  blinkit: fetchBlinkitResult,
  zepto: fetchZeptoResult,
  bbnow: fetchBigBasketResult,
  flipkart_minutes: fetchFlipkartResult,
  amazon_fresh: fetchAmazonFreshResult,
  starquik: fetchStarQuikResult,
};

// ── quantity normalization: derive a comparable price-per-base-unit ──
function parseQuantity(quantityStr) {
  if (!quantityStr) return null;
  const m = String(quantityStr)
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|l|ltr|litre|liter|ml)\b/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2];
  if (!Number.isFinite(value) || value <= 0) return null;

  // normalize to grams (mass) or millilitres (volume)
  if (unit === 'kg') return { base: value * 1000, kind: 'mass' };
  if (unit === 'g' || unit === 'gram' || unit === 'grams') return { base: value, kind: 'mass' };
  if (unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'liter') return { base: value * 1000, kind: 'volume' };
  if (unit === 'ml') return { base: value, kind: 'volume' };
  return null;
}

function mapProviderPreview(item, query) {
  if (!item || !item.title) return null;

  const quantityInfo = parseQuantity(item.quantity);
  const amount = item.price?.amount || 0;
  const unitPrice =
    quantityInfo && amount > 0 ? amount / quantityInfo.base : null;

  const { confidence, brandMatch } = matchConfidence(query, item.title, item.quantity);

  return {
    title: item.title,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    price: {
      amount,
      currency: item.price?.currency || 'INR',
      mrp: item.price?.mrp,
    },
    unitPrice, // price per gram/ml when quantity is parseable
    unitBasis: quantityInfo ? quantityInfo.kind : null,
    etaMinutes: Number.isFinite(item.etaMinutes) ? item.etaMinutes : null,
    matchConfidence: confidence,
    matchLabel: confidenceLabel(confidence),
    brandMatch,
    url: item.url,
    inStock: item.inStock == null ? true : Boolean(item.inStock),
  };
}

async function resolveProviderResult(provider, query, location) {
  const url = provider.searchUrl(query);
  const adapter = ADAPTERS[provider.id];

  // Serviceability gate: if the location is clearly outside this platform's
  // coverage, report "not serviceable" and skip the product scrape entirely.
  // Unknown coverage (null) does not block — we let the scrape self-report.
  const { serviceable, reason } = checkServiceability(provider.id, location);
  if (serviceable === false) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      color: provider.color,
      status: 'not_serviceable',
      statusMessage: reason || `${provider.name} does not deliver to this location.`,
      preview: null,
      url,
    };
  }

  try {
    // Wrap scrape in a timeout so slow providers don't block the whole search
    const scrapePromise = adapter
      ? scrapeLimit(() => adapter(query, location))
      : fetchGenericResult(provider.name, query, location);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), PROVIDER_TIMEOUT_MS)
    );

    const previewData = await Promise.race([scrapePromise, timeoutPromise]);

    // Adapter explicitly reported the location is not serviceable.
    if (previewData && previewData.serviceable === false) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        status: 'not_serviceable',
        statusMessage: `${provider.name} does not deliver to this location.`,
        preview: null,
        url,
      };
    }

    const preview = mapProviderPreview(previewData, query);

    if (!preview) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        status: 'not_found',
        statusMessage: 'No results found',
        preview: null,
        url,
      };
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      color: provider.color,
      status: 'matched',
      statusMessage: null,
      preview: { ...preview, url: preview.url || url },
      url,
    };
  } catch (err) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      color: provider.color,
      status: 'error',
      statusMessage: `Error fetching live results from ${provider.name}.`,
      preview: null,
      url,
    };
  }
}

// ── transparent recommendation: relevance → ETA → normalized price ──
function computeRecommendation(query, results) {
  const matched = results.filter((r) => r.status === 'matched' && r.preview);
  if (matched.length === 0) return { recommendedProviderId: null, reason: null };

  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const scored = matched.map((r) => {
    const title = (r.preview.title || '').toLowerCase();
    const matchCount = queryTokens.length
      ? queryTokens.filter((t) => title.includes(t)).length
      : 0;
    const relevance = queryTokens.length ? matchCount / queryTokens.length : 0;
    const price = r.preview.price?.amount ?? Infinity;
    const unitPrice = r.preview.unitPrice; // may be null
    const eta = r.preview.etaMinutes; // may be null
    return { r, relevance, price, unitPrice, eta };
  });

  // Prefer stronger title relevance first.
  const maxRelevance = Math.max(...scored.map((s) => s.relevance));
  const relevant = scored.filter((s) => s.relevance >= Math.max(maxRelevance - 0.001, 0.0001));
  const pool = relevant.length ? relevant : scored;

  // Composite score. Lower is better; convert to higher-is-better.
  const anyUnit = pool.some((s) => s.unitPrice != null);
  const anyEta = pool.some((s) => s.eta != null);

  let best = null;
  for (const s of pool) {
    const priceForCompare = anyUnit && s.unitPrice != null ? s.unitPrice : s.price;
    // Normalize: rank within pool later; here store raw comparables.
    s._priceForCompare = priceForCompare;
    if (!best) best = s;
  }

  pool.sort((a, b) => {
    // ETA weighted, then price. Missing ETA sorts after known ETAs.
    if (anyEta) {
      const ae = a.eta == null ? Infinity : a.eta;
      const be = b.eta == null ? Infinity : b.eta;
      if (ae !== be) return ae - be;
    }
    return a._priceForCompare - b._priceForCompare;
  });

  best = pool[0];
  const reasonParts = [];
  if (best.eta != null) reasonParts.push(`fastest delivery (~${best.eta} min)`);
  if (anyUnit && best.unitPrice != null) reasonParts.push('best value per unit');
  else reasonParts.push('lowest price');

  return {
    recommendedProviderId: best.r.providerId,
    reason: `Recommended for ${reasonParts.join(' & ')}.`,
  };
}

async function compareProductUncached(query, location) {
  const warnings = [];
  let product = null;
  let locationInfo = null;
  let priceIntel = null;

  // Product catalog + location classification in parallel with scraping.
  const catalogPromise = searchProductCatalog(query).catch(() => {
    warnings.push('Open Food Facts lookup is temporarily unavailable.');
    return null;
  });

  const locationPromise =
    location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
      ? reverseGeocode(location.lat, location.lng).catch(() => null)
      : Promise.resolve(null);

  const providerPromise = Promise.all(
    PROVIDERS.map((provider) => resolveProviderResult(provider, query, location))
  );

  const [productResult, locationResult, providerResults] = await Promise.all([
    catalogPromise,
    locationPromise,
    providerPromise,
  ]);

  product = productResult;
  locationInfo = locationResult;

  // Observed community prices for the matched catalog product (best-effort).
  if (product && product.code) {
    try {
      priceIntel = await fetchObservedPrices(product.code);
    } catch (_err) {
      priceIntel = null;
    }
  }

  const { recommendedProviderId, reason } = computeRecommendation(query, providerResults);

  return {
    catalogLookupStatus: product ? 'matched' : 'not_found',
    locationInfo,
    priceIntel,
    product,
    results: providerResults,
    recommendedProviderId,
    recommendationReason: reason,
    warnings,
  };
}

// ── Short-TTL cache: repeat searches for the same product+location are
//    served instantly instead of re-running six live scrapes. ──
const searchCache = new Map();
const SEARCH_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS || 5 * 60 * 1000); // 5 min

function locationKey(location = {}) {
  if (location.pincode) return `pin:${location.pincode}`;
  if (location.city) return `city:${String(location.city).toLowerCase()}`;
  if (Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
    return `geo:${Number(location.lat).toFixed(2)},${Number(location.lng).toFixed(2)}`;
  }
  return 'none';
}

async function compareProduct(query, location) {
  const key = `${String(query || '').trim().toLowerCase()}|${locationKey(location)}`;
  const hit = searchCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.value, cached: true };
  }

  const value = await compareProductUncached(query, location);

  // Only cache useful responses (at least one matched provider), so we don't
  // lock in a transient all-empty scrape for 5 minutes.
  const hasMatch = (value.results || []).some((r) => r.status === 'matched');
  if (hasMatch) {
    if (searchCache.size > 300) {
      const oldest = Array.from(searchCache.keys()).slice(0, 50);
      for (const k of oldest) searchCache.delete(k);
    }
    searchCache.set(key, { value, expiresAt: Date.now() + SEARCH_TTL_MS });
  }

  return { ...value, cached: false };
}

// ── Scraper health: run each adapter against a canary query and report
//    whether it still returns a usable result. Lets ops catch selector rot. ──
async function checkProviderHealth(canaryQuery = 'milk', location = {}) {
  const started = Date.now();
  const checks = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const adapter = ADAPTERS[provider.id];
      if (!adapter) {
        return { providerId: provider.id, providerName: provider.name, status: 'not_integrated', ok: false, ms: 0 };
      }
      const t = Date.now();
      try {
        const data = await scrapeLimit(() => adapter(canaryQuery, location));
        const ms = Date.now() - t;
        if (data && data.serviceable === false) {
          return { providerId: provider.id, providerName: provider.name, status: 'not_serviceable', ok: true, ms };
        }
        const ok = !!(data && data.title && data.price && data.price.amount);
        return {
          providerId: provider.id,
          providerName: provider.name,
          status: ok ? 'healthy' : 'no_results',
          ok,
          ms,
          sample: ok ? { title: data.title, price: data.price.amount } : null,
        };
      } catch (err) {
        return {
          providerId: provider.id,
          providerName: provider.name,
          status: 'error',
          ok: false,
          ms: Date.now() - t,
          error: err.message,
        };
      }
    })
  );

  const healthy = checks.filter((c) => c.status === 'healthy').length;
  return {
    canaryQuery,
    checkedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    healthy,
    total: PROVIDERS.length,
    providers: checks,
  };
}

/**
 * Streaming variant: resolves each provider independently and calls `onEvent`
 * as soon as each one finishes. Used by the SSE endpoint.
 */
async function compareProductStreaming(query, location, onEvent) {
  const warnings = [];

  // Kick off catalog + location lookups first
  const catalogPromise = searchProductCatalog(query).catch(() => {
    warnings.push('Open Food Facts lookup is temporarily unavailable.');
    return null;
  });

  const locationPromise =
    location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
      ? reverseGeocode(location.lat, location.lng).catch(() => null)
      : Promise.resolve(null);

  // Emit metadata as soon as catalog/location resolve
  const [product, locationInfo] = await Promise.all([catalogPromise, locationPromise]);

  let priceIntel = null;
  if (product && product.code) {
    try { priceIntel = await fetchObservedPrices(product.code); } catch (_e) { /* skip */ }
  }

  onEvent({
    type: 'meta',
    data: {
      catalogLookupStatus: product ? 'matched' : 'not_found',
      product,
      locationInfo,
      priceIntel,
      warnings,
    },
  });

  // Stream each provider result as it resolves
  const providerPromises = PROVIDERS.map(async (provider) => {
    const result = await resolveProviderResult(provider, query, location);
    onEvent({ type: 'provider', data: result });
    return result;
  });

  await Promise.all(providerPromises);
}

module.exports = { compareProduct, compareProductUncached, compareProductStreaming, checkProviderHealth, PROVIDERS };
