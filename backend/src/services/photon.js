/**
 * Photon location provider (https://photon.komoot.io).
 *
 * Photon is a free, OpenStreetMap-based geocoder built specifically for
 * type-ahead autocomplete. No API key required. It generally returns more
 * relevant, ranked predictions than raw Nominatim search, which makes it a
 * better default free engine for address entry.
 *
 * Output is normalized to the same shape used across the app so it is a
 * drop-in alternative to the Google/Nominatim providers.
 */

const { createCache } = require('../utils/cache');

const PHOTON_BASE = process.env.PHOTON_BASE || 'https://photon.komoot.io';
const BIAS_LAT = Number(process.env.PHOTON_BIAS_LAT || 22.5);
const BIAS_LON = Number(process.env.PHOTON_BIAS_LON || 79.0);
const LANG = process.env.PHOTON_LANGUAGE || 'en';

const cache = createCache({ maxSize: 1000, ttlMs: 60 * 60 * 1000 });

// Build a human label from Photon's discrete address fields.
function buildLabel(p) {
  const parts = [
    p.name,
    p.street,
    p.district,
    p.city,
    p.county && p.county !== p.city ? p.county : null,
    p.state,
    p.postcode,
  ].filter(Boolean);
  // De-duplicate consecutive equal parts (Photon often repeats name/city).
  const deduped = parts.filter((v, i) => v !== parts[i - 1]);
  return deduped.join(', ');
}

function buildShortLabel(p) {
  const locality = p.name || p.district || p.suburb || null;
  const city = p.city || p.county || null;
  const parts = [];
  if (locality) parts.push(locality);
  if (city && city !== locality) parts.push(city);
  if (parts.length === 0 && p.state) parts.push(p.state);
  return parts.join(', ');
}

function normalizeFeature(feature) {
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const city = p.city || p.county || p.district || null;
  const suburb = p.district || p.suburb || p.locality || null;

  return {
    label: buildLabel(p) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    shortLabel: buildShortLabel(p) || buildLabel(p),
    lat,
    lng,
    pincode: p.postcode || null,
    city,
    suburb: suburb && suburb !== city ? suburb : null,
    state: p.state || null,
    country: p.country || null,
    countryCode: (p.countrycode || '').toUpperCase() || null,
    classification: city ? 'urban' : 'unknown',
    addresstype: p.type || null,
    type: p.osm_value || p.type || null,
    placeRank: null,
    settlementType: p.type || null,
    importance: null,
  };
}

async function searchPlaces(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const cacheKey = `ph:s:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL('/api/', PHOTON_BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '8');
  url.searchParams.set('lang', LANG);
  url.searchParams.set('lat', String(BIAS_LAT));
  url.searchParams.set('lon', String(BIAS_LON));

  const res = await fetch(url, { headers: { 'User-Agent': 'SaveQart/1.0' } });
  if (!res.ok) throw new Error(`Photon ${res.status}`);

  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];

  // Prefer India results, keep order otherwise.
  const normalized = features
    .map(normalizeFeature)
    .filter(Boolean)
    .sort((a, b) => {
      const aIn = a.countryCode === 'IN' ? 0 : 1;
      const bIn = b.countryCode === 'IN' ? 0 : 1;
      return aIn - bIn;
    });

  cache.set(cacheKey, normalized);
  return normalized;
}

async function reverseGeocode(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error('Invalid coordinates');
  }

  const cacheKey = `ph:r:${parsedLat.toFixed(5)},${parsedLng.toFixed(5)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL('/reverse', PHOTON_BASE);
  url.searchParams.set('lat', String(parsedLat));
  url.searchParams.set('lon', String(parsedLng));
  url.searchParams.set('lang', LANG);

  const res = await fetch(url, { headers: { 'User-Agent': 'SaveQart/1.0' } });
  if (!res.ok) throw new Error(`Photon reverse ${res.status}`);

  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];
  if (features.length === 0) throw new Error('Photon reverse: no result');

  const result = normalizeFeature(features[0]);
  if (!result) throw new Error('Photon reverse: unparseable');

  // Reverse sometimes omits pincode on the nearest feature; keep exact coords.
  result.lat = parsedLat;
  result.lng = parsedLng;

  cache.set(cacheKey, result);
  return result;
}

module.exports = {
  searchPlaces,
  reverseGeocode,
};
