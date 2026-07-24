/**
 * Google Maps Platform location provider.
 *
 * Uses the Places API (New) for forward search (autocomplete + details) and
 * the Geocoding API for reverse geocoding. This is the same class of service
 * used by large consumer apps for precise address entry.
 *
 * Activates only when GOOGLE_MAPS_API_KEY is set. All output is normalized to
 * the same shape as the Nominatim provider so downstream code is unchanged:
 *   { label, shortLabel, lat, lng, pincode, city, suburb, state, country,
 *     countryCode, placeId?, classification, ... }
 */

const { createCache } = require('../utils/cache');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const PLACES_BASE = 'https://places.googleapis.com/v1';
const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const REGION = process.env.GOOGLE_MAPS_REGION || 'in';
const LANGUAGE = process.env.GOOGLE_MAPS_LANGUAGE || 'en';

const cache = createCache({ maxSize: 1000, ttlMs: 60 * 60 * 1000 });

function isConfigured() {
  return Boolean(API_KEY);
}

// ── address component extraction (shared shape) ──
function componentValue(components, type, useShort = false) {
  const match = (components || []).find((c) => (c.types || []).includes(type));
  if (!match) return null;
  return (useShort ? match.shortText || match.short_name : match.longText || match.long_name) || null;
}

function normalizeFromComponents(components, { lat, lng, formattedAddress }) {
  const pincode = componentValue(components, 'postal_code');
  const city =
    componentValue(components, 'locality') ||
    componentValue(components, 'administrative_area_level_2') ||
    componentValue(components, 'administrative_area_level_3') ||
    null;
  const suburb =
    componentValue(components, 'sublocality') ||
    componentValue(components, 'sublocality_level_1') ||
    componentValue(components, 'neighborhood') ||
    null;
  const state = componentValue(components, 'administrative_area_level_1');
  const country = componentValue(components, 'country');
  const countryCode = componentValue(components, 'country', true);

  const shortLabel = [suburb, city].filter(Boolean).join(', ') || city || state || formattedAddress || null;

  return {
    label: formattedAddress || shortLabel || `${lat}, ${lng}`,
    shortLabel: shortLabel || formattedAddress,
    lat,
    lng,
    pincode: pincode || null,
    city,
    suburb,
    state,
    country,
    countryCode: countryCode ? countryCode.toUpperCase() : null,
    // Serviceability follow-up will use precise coordinates + pincode.
    classification: city ? 'urban' : 'unknown',
    addresstype: null,
    type: null,
    placeRank: null,
    settlementType: null,
    importance: null,
  };
}

// ── Places API (New): autocomplete ──
async function autocomplete(input, sessionToken) {
  const q = (input || '').trim();
  if (q.length < 2) return [];

  const cacheKey = `g:ac:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: [REGION],
      languageCode: LANGUAGE,
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Autocomplete ${res.status}`);
  }

  const data = await res.json();
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  const predictions = suggestions
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      placeId: p.placeId,
      label: p.text?.text || '',
      shortLabel: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }));

  cache.set(cacheKey, predictions);
  return predictions;
}

// ── Places API (New): place details (resolve coordinates + components) ──
async function placeDetails(placeId, sessionToken) {
  if (!placeId) return null;
  const cacheKey = `g:pd:${placeId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'location,formattedAddress,addressComponents,displayName',
    },
  });

  if (!res.ok) {
    throw new Error(`Google Place Details ${res.status}`);
  }

  const data = await res.json();
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  const normalized = normalizeFromComponents(data.addressComponents, {
    lat,
    lng,
    formattedAddress: data.formattedAddress,
  });
  normalized.placeId = placeId;

  cache.set(cacheKey, normalized);
  return normalized;
}

/**
 * searchPlaces: autocomplete + resolve each prediction to coordinates.
 * Matches the Nominatim provider signature so it is a drop-in replacement.
 * Resolves details for the top N predictions only (billing-conscious).
 */
async function searchPlaces(query, { sessionToken, resolveTop = 5 } = {}) {
  const predictions = await autocomplete(query, sessionToken);
  if (predictions.length === 0) return [];

  const top = predictions.slice(0, resolveTop);
  const resolved = await Promise.all(
    top.map(async (p) => {
      try {
        const details = await placeDetails(p.placeId, sessionToken);
        if (!details) return null;
        return { ...details, shortLabel: p.shortLabel || details.shortLabel, secondary: p.secondary };
      } catch (_err) {
        return null;
      }
    })
  );

  return resolved.filter(Boolean);
}

// ── Geocoding API: reverse geocode ──
async function reverseGeocode(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw new Error('Invalid coordinates');
  }

  const cacheKey = `g:rev:${parsedLat.toFixed(5)},${parsedLng.toFixed(5)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(GEOCODE_BASE);
  url.searchParams.set('latlng', `${parsedLat},${parsedLng}`);
  url.searchParams.set('language', LANGUAGE);
  url.searchParams.set('region', REGION);
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Geocoding ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(`Google Geocoding status ${data.status}`);
  }

  const best = data.results[0];
  const normalized = normalizeFromComponents(best.address_components, {
    lat: parsedLat,
    lng: parsedLng,
    formattedAddress: best.formatted_address,
  });
  normalized.placeId = best.place_id || null;

  cache.set(cacheKey, normalized);
  return normalized;
}

module.exports = {
  isConfigured,
  searchPlaces,
  reverseGeocode,
  autocomplete,
  placeDetails,
};
