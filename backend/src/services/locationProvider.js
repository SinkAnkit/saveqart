const logger = require('../utils/logger');
/**
 * Location provider abstraction.
 *
 * Priority chain (first available/successful wins):
 *   1. Google Maps Platform (Places New + Geocoding) — only when
 *      GOOGLE_MAPS_API_KEY is set. Highest precision, requires a billed key.
 *   2. Photon (photon.komoot.io) — free, no key, OSM-based, autocomplete-first.
 *      This is the DEFAULT engine when no Google key is configured.
 *   3. Nominatim — final free fallback.
 *
 * All backends return the same normalized shape, so routes, scrapers, and the
 * frontend are unchanged regardless of which provider served the result.
 */

const google = require('./googlePlaces');
const photon = require('./photon');
const nominatim = require('./locationIntel');

function defaultFreeProvider() {
  return (process.env.LOCATION_PROVIDER || 'photon').toLowerCase();
}

function activeProvider() {
  if (google.isConfigured()) return 'google';
  return defaultFreeProvider() === 'nominatim' ? 'nominatim' : 'photon';
}

async function searchPlaces(query, opts = {}) {
  // 1. Google (precise) when keyed.
  if (google.isConfigured()) {
    try {
      const results = await google.searchPlaces(query, opts);
      if (results.length > 0) return results;
    } catch (err) {
      logger.warn('[location] Google search failed:', err.message);
    }
  }

  // 2. Photon (default free engine).
  if (defaultFreeProvider() !== 'nominatim') {
    try {
      const results = await photon.searchPlaces(query);
      if (results.length > 0) return results;
    } catch (err) {
      logger.warn('[location] Photon search failed, falling back to Nominatim:', err.message);
    }
  }

  // 3. Nominatim (final fallback).
  return nominatim.searchPlaces(query);
}

async function reverseGeocode(lat, lng) {
  if (google.isConfigured()) {
    try {
      return await google.reverseGeocode(lat, lng);
    } catch (err) {
      logger.warn('[location] Google reverse failed:', err.message);
    }
  }

  if (defaultFreeProvider() !== 'nominatim') {
    try {
      return await photon.reverseGeocode(lat, lng);
    } catch (err) {
      logger.warn('[location] Photon reverse failed, falling back to Nominatim:', err.message);
    }
  }

  return nominatim.reverseGeocode(lat, lng);
}

module.exports = {
  activeProvider,
  searchPlaces,
  reverseGeocode,
};
