const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/price-history/:query
 * Returns the price history for a product query across providers.
 * Shows price trends and "price dropped" signals.
 */
router.get('/:query', authRequired, (req, res) => {
  const query = decodeURIComponent(req.params.query).trim().toLowerCase();
  if (!query || query.length < 1) {
    return res.status(400).json({ error: 'Invalid query' });
  }

  const rows = db
    .prepare(
      `SELECT provider_id, provider_name, price, currency, title, location_label, created_at
       FROM price_history
       WHERE LOWER(query) = ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(query);

  if (rows.length === 0) {
    return res.json({ query, history: [], signals: [] });
  }

  // Group by provider and detect price changes
  const byProvider = {};
  for (const row of rows) {
    if (!byProvider[row.provider_id]) {
      byProvider[row.provider_id] = [];
    }
    byProvider[row.provider_id].push(row);
  }

  const signals = [];
  for (const [providerId, entries] of Object.entries(byProvider)) {
    if (entries.length < 2) continue;
    const latest = entries[0];
    const previous = entries[1];
    const diff = latest.price - previous.price;
    if (diff < 0) {
      signals.push({
        type: 'price_dropped',
        providerId,
        providerName: latest.provider_name,
        currentPrice: latest.price,
        previousPrice: previous.price,
        drop: Math.abs(diff),
        dropPercent: Math.round((Math.abs(diff) / previous.price) * 100),
        observedAt: latest.created_at,
      });
    } else if (diff > 0) {
      signals.push({
        type: 'price_increased',
        providerId,
        providerName: latest.provider_name,
        currentPrice: latest.price,
        previousPrice: previous.price,
        increase: diff,
        increasePercent: Math.round((diff / previous.price) * 100),
        observedAt: latest.created_at,
      });
    }
  }

  // Per-provider latest + lowest ever
  const summary = Object.entries(byProvider).map(([providerId, entries]) => {
    const prices = entries.map((e) => e.price);
    return {
      providerId,
      providerName: entries[0].provider_name,
      latestPrice: entries[0].price,
      lowestEver: Math.min(...prices),
      highestEver: Math.max(...prices),
      observationCount: entries.length,
      firstSeen: entries[entries.length - 1].created_at,
      lastSeen: entries[0].created_at,
    };
  });

  res.json({ query, history: rows, signals, summary });
});

/**
 * Record price observations for a search.
 * Called internally from the search route after scraping results.
 */
function recordPrices(query, results, locationLabel) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  if (!normalizedQuery) return;

  const insert = db.prepare(
    `INSERT INTO price_history (query, provider_id, provider_name, price, currency, title, location_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(
        normalizedQuery,
        item.providerId,
        item.providerName,
        item.price,
        item.currency || 'INR',
        item.title || null,
        locationLabel || null
      );
    }
  });

  const toRecord = (results || [])
    .filter((r) => r.status === 'matched' && r.preview?.price?.amount != null)
    .map((r) => ({
      providerId: r.providerId,
      providerName: r.providerName,
      price: r.preview.price.amount,
      currency: r.preview.price.currency,
      title: r.preview.title,
    }));

  if (toRecord.length > 0) {
    insertMany(toRecord);
  }
}

/**
 * Get price drop signals for a query (used by the search response).
 */
function getPriceSignals(query) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];

  const rows = db
    .prepare(
      `SELECT provider_id, provider_name, price, created_at
       FROM price_history
       WHERE LOWER(query) = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(normalizedQuery);

  if (rows.length < 2) return [];

  const byProvider = {};
  for (const row of rows) {
    if (!byProvider[row.provider_id]) byProvider[row.provider_id] = [];
    byProvider[row.provider_id].push(row);
  }

  const signals = [];
  for (const [providerId, entries] of Object.entries(byProvider)) {
    if (entries.length < 2) continue;
    const current = entries[0];
    const previous = entries[1];
    if (current.price < previous.price) {
      signals.push({
        type: 'price_dropped',
        providerId,
        providerName: current.provider_name,
        currentPrice: current.price,
        previousPrice: previous.price,
        dropPercent: Math.round(((previous.price - current.price) / previous.price) * 100),
      });
    }
  }

  return signals;
}

router.recordPrices = recordPrices;
router.getPriceSignals = getPriceSignals;

module.exports = router;
