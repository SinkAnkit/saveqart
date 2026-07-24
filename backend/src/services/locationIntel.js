const { createCache } = require('../utils/cache');

const NOMINATIM = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'SaveQart/1.0 (https://saveqart.local)';

const cache = createCache({ maxSize: 1000, ttlMs: 24 * 60 * 60 * 1000 });

const URBAN_TYPES = new Set([
  'borough',
  'city',
  'city_district',
  'neighbourhood',
  'quarter',
  'residential',
  'suburb',
]);

const TOWN_TYPES = new Set([
  'municipality',
  'town',
]);

const RURAL_TYPES = new Set([
  'allotments',
  'farm',
  'hamlet',
  'isolated_dwelling',
  'village',
]);

function buildShortLabel(raw) {
  const address = raw.address || {};
  const locality =
    address.suburb ||
    address.neighbourhood ||
    address.village ||
    address.town ||
    address.city_district ||
    address.hamlet ||
    address.locality;
  const city = address.city || address.town || address.state_district || address.county;
  const state = address.state;
  const parts = [];

  if (locality && locality !== city) parts.push(locality);
  if (city) parts.push(city);
  else if (state) parts.push(state);

  if (parts.length === 0 && raw.display_name) {
    return raw.display_name.split(',').slice(0, 2).join(',').trim();
  }

  return parts.join(', ');
}

function getSettlementType(raw) {
  const address = raw.address || {};
  return (
    (address.city && 'city') ||
    (address.town && 'town') ||
    (address.village && 'village') ||
    (address.hamlet && 'hamlet') ||
    (address.suburb && 'suburb') ||
    (address.neighbourhood && 'neighbourhood') ||
    (address.city_district && 'city_district') ||
    (address.locality && 'locality') ||
    raw.addresstype ||
    raw.type ||
    null
  );
}

function classify(raw) {
  const settlementType = getSettlementType(raw);
  const addresstype = raw.addresstype || raw.type || settlementType;
  const placeRank = Number(raw.place_rank) || null;
  let classification = 'unknown';

  if (RURAL_TYPES.has(settlementType) || RURAL_TYPES.has(addresstype)) {
    classification = 'rural';
  } else if (TOWN_TYPES.has(settlementType) || TOWN_TYPES.has(addresstype)) {
    classification = 'town';
  } else if (URBAN_TYPES.has(settlementType) || URBAN_TYPES.has(addresstype)) {
    classification = 'urban';
  } else if (placeRank != null) {
    if (placeRank <= 18) classification = 'urban';
    else if (placeRank === 19) classification = 'town';
    else if (placeRank >= 20) classification = 'rural';
  }

  return {
    addresstype: addresstype || null,
    type: raw.type || null,
    placeRank,
    settlementType,
    classification,
  };
}

async function request(path, params, cacheKey) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(path, NOMINATIM);
  Object.entries(params).forEach(([k, value]) => {
    if (value != null && value !== '') url.searchParams.set(k, String(value));
  });

  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim ${res.status}`);
  }

  const data = await res.json();
  cache.set(cacheKey, data);
  return data;
}

function extractAddress(raw) {
  const address = raw.address || {};
  const pincode = address.postcode || null;
  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.state_district ||
    address.county ||
    null;
  const suburb =
    address.suburb ||
    address.neighbourhood ||
    address.quarter ||
    address.city_district ||
    address.locality ||
    null;
  const state = address.state || null;
  const country = address.country || null;
  const countryCode = (address.country_code || '').toUpperCase() || null;

  return { pincode, city, suburb, state, country, countryCode };
}

function mapResult(raw, latOverride, lngOverride) {
  const locationClass = classify(raw);
  const lat = Number.isFinite(latOverride) ? latOverride : parseFloat(raw.lat);
  const lng = Number.isFinite(lngOverride) ? lngOverride : parseFloat(raw.lon);
  const address = extractAddress(raw);

  return {
    label: raw.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    shortLabel: buildShortLabel(raw),
    lat,
    lng,
    importance: raw.importance ?? null,
    ...address,
    address,
    ...locationClass,
  };
}

async function searchPlaces(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const raw = await request(
    '/search',
    {
      addressdetails: 1,
      countrycodes: 'in',
      format: 'jsonv2',
      limit: 8,
      q,
    },
    `search:${q.toLowerCase()}`
  );

  return (Array.isArray(raw) ? raw : []).map((item) => mapResult(item));
}

async function reverseGeocode(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error('Invalid coordinates');
  }

  const raw = await request(
    '/reverse',
    {
      addressdetails: 1,
      format: 'jsonv2',
      lat: parsedLat,
      lon: parsedLng,
      zoom: 16,
    },
    `reverse:${parsedLat.toFixed(4)},${parsedLng.toFixed(4)}`
  );

  return mapResult(raw, parsedLat, parsedLng);
}

module.exports = {
  reverseGeocode,
  searchPlaces,
};
