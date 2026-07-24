const logger = require('../utils/logger');
const express = require('express');
const { query, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { compareProduct, compareProductStreaming, PROVIDERS } = require('../providers');
const { recordPrices, getPriceSignals } = require('./priceHistory');

const router = express.Router();

// ── Standard search (waits for all providers, returns JSON) ──
router.get(
  '/',
  authRequired,
  query('q').isString().trim().isLength({ min: 1, max: 120 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid query' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!user.location_label) {
      return res.status(412).json({
        error: 'Location required',
        code: 'LOCATION_REQUIRED',
        message: 'Please set your delivery location before searching.',
      });
    }

    const q = req.query.q;
    const location = {
      label: user.location_label,
      lat: user.location_lat,
      lng: user.location_lng,
      pincode: user.location_pincode || null,
      city: user.location_city || null,
      state: user.location_state || null,
    };

    try {
      const data = await compareProduct(q, location);
      const matchedProviders = (data.results || []).filter((item) => item.status === 'matched');
      const recommended =
        (data.results || []).find(
          (item) => item.providerId === data.recommendedProviderId
        ) || matchedProviders[0] || null;
      let message = null;

      if (matchedProviders.length === 0) {
        message = 'No provider returned a matching result for this query right now.';
      }

      db.prepare(
        `INSERT INTO search_history
          (user_id, query, location_label, result_count, best_provider, best_price)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        user.id,
        q,
        location.label,
        matchedProviders.length,
        recommended?.providerName || null,
        recommended?.preview?.price?.amount ?? null
      );

      // Record prices for history tracking
      recordPrices(q, data.results, location.label);

      // Get price signals (drops/increases vs last observation)
      const priceSignals = getPriceSignals(q);

      return res.json({
        query: q,
        location,
        catalogLookupStatus: data.catalogLookupStatus,
        locationInfo: data.locationInfo,
        priceIntel: data.priceIntel,
        priceSignals,
        product: data.product,
        results: data.results,
        recommendedProviderId: data.recommendedProviderId,
        recommendationReason: data.recommendationReason,
        warnings: data.warnings,
        cached: data.cached || false,
        message,
      });
    } catch (err) {
      logger.error({ err: err.message }, 'search error');
      return res.status(500).json({ error: 'Search failed', message: 'Please try again.' });
    }
  }
);

// ── SSE streaming search (sends each provider result as it resolves) ──
router.get(
  '/stream',
  authRequired,
  query('q').isString().trim().isLength({ min: 1, max: 120 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid query' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!user.location_label) {
      return res.status(412).json({
        error: 'Location required',
        code: 'LOCATION_REQUIRED',
        message: 'Please set your delivery location before searching.',
      });
    }

    const q = req.query.q;
    const location = {
      label: user.location_label,
      lat: user.location_lat,
      lng: user.location_lng,
      pincode: user.location_pincode || null,
      city: user.location_city || null,
      state: user.location_state || null,
    };

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Handle client disconnect
    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
      const allResults = [];
      await compareProductStreaming(q, location, (event) => {
        if (aborted) return;

        if (event.type === 'meta') {
          send('meta', event.data);
        } else if (event.type === 'provider') {
          allResults.push(event.data);
          send('provider', event.data);
        }
      });

      if (!aborted) {
        // Record prices + compute signals
        recordPrices(q, allResults, location.label);
        const priceSignals = getPriceSignals(q);

        // Save to search history
        const matched = allResults.filter((r) => r.status === 'matched');
        const best = matched[0];
        db.prepare(
          `INSERT INTO search_history
            (user_id, query, location_label, result_count, best_provider, best_price)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(user.id, q, location.label, matched.length, best?.providerName || null, best?.preview?.price?.amount ?? null);

        send('done', { priceSignals, resultCount: allResults.length });
        res.end();
      }
    } catch (err) {
      logger.error({ err: err.message }, 'stream search error');
      if (!aborted) {
        send('error', { message: 'Search failed' });
        res.end();
      }
    }
  }
);

module.exports = router;
