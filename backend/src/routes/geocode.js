const logger = require('../utils/logger');
const express = require('express');
const { reverseGeocode, searchPlaces, activeProvider } = require('../services/locationProvider');

const router = express.Router();

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ results: [], provider: activeProvider() });

  // Optional Google session token (groups autocomplete + details for billing).
  const sessionToken = (req.query.session || '').toString().trim() || undefined;

  try {
    const results = await searchPlaces(q, { sessionToken });
    res.json({ results, provider: activeProvider() });
  } catch (err) {
    logger.error('geocode search error', err.message);
    res.status(502).json({ error: 'Geocoding service unavailable', results: [] });
  }
});

router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid lat/lng' });
  }

  try {
    const result = await reverseGeocode(lat, lng);
    res.json(result);
  } catch (err) {
    logger.error('geocode reverse error', err.message);
    res.json({
      label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      shortLabel: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
      pincode: null,
      city: null,
      suburb: null,
      state: null,
      addresstype: null,
      classification: 'unknown',
      importance: null,
      placeRank: null,
      settlementType: null,
      type: null,
    });
  }
});

module.exports = router;
