const logger = require('../utils/logger');
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { compareProduct, PROVIDERS } = require('../providers');

const router = express.Router();

/**
 * POST /api/basket/compare
 * Body: { items: ["amul milk", "maggi", ...] }  (2..15 items)
 *
 * Runs a comparison for each item at the user's location, then computes:
 *  - perApp:   for each provider, the total if you buy every available item
 *              there (and which items are missing).
 *  - cheapestSingleApp: the app with the lowest total that has ALL items.
 *  - cheapestSplit: the cheapest possible total by picking the cheapest
 *              provider per item (a "split" cart across apps).
 */
router.post(
  '/compare',
  authRequired,
  body('items').isArray({ min: 1, max: 15 }),
  body('items.*').isString().trim().isLength({ min: 1, max: 120 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid items' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.location_label) {
      return res.status(412).json({
        error: 'Location required',
        code: 'LOCATION_REQUIRED',
        message: 'Please set your delivery location before comparing a basket.',
      });
    }

    const location = {
      label: user.location_label,
      lat: user.location_lat,
      lng: user.location_lng,
      pincode: user.location_pincode || null,
      city: user.location_city || null,
      state: user.location_state || null,
    };

    // De-duplicate + cap items.
    const items = [...new Set(req.body.items.map((s) => s.trim()).filter(Boolean))].slice(0, 15);

    try {
      // Compare all items (compareProduct is cached, so repeats are instant).
      const perItem = await Promise.all(
        items.map(async (q) => {
          const data = await compareProduct(q, location);
          const offers = {};
          for (const r of data.results || []) {
            if (r.status === 'matched' && r.preview?.price?.amount != null) {
              offers[r.providerId] = {
                price: r.preview.price.amount,
                title: r.preview.title,
                etaMinutes: r.preview.etaMinutes ?? null,
                url: r.preview.url || r.url,
              };
            }
          }
          return { query: q, offers };
        })
      );

      // ── Per-app totals ──
      const perApp = PROVIDERS.map((p) => {
        let total = 0;
        const have = [];
        const missing = [];
        for (const item of perItem) {
          const offer = item.offers[p.id];
          if (offer) {
            total += offer.price;
            have.push({ query: item.query, price: offer.price });
          } else {
            missing.push(item.query);
          }
        }
        return {
          providerId: p.id,
          providerName: p.name,
          itemsFound: have.length,
          itemsMissing: missing.length,
          missing,
          total: have.length ? Math.round(total) : null,
          complete: missing.length === 0 && have.length > 0,
        };
      });

      // ── Cheapest single app that has ALL items ──
      const completeApps = perApp
        .filter((a) => a.complete)
        .sort((a, b) => a.total - b.total);
      const cheapestSingleApp = completeApps[0] || null;

      // ── Cheapest split (best provider per item) ──
      const splitLines = perItem.map((item) => {
        let best = null;
        for (const [providerId, offer] of Object.entries(item.offers)) {
          if (!best || offer.price < best.price) {
            best = { providerId, ...offer };
          }
        }
        return { query: item.query, best };
      });
      const splitFound = splitLines.filter((l) => l.best);
      const cheapestSplit = {
        total: splitFound.length
          ? Math.round(splitFound.reduce((s, l) => s + l.best.price, 0))
          : null,
        lines: splitLines,
        itemsFound: splitFound.length,
        itemsMissing: items.length - splitFound.length,
      };

      const savingsVsSingle =
        cheapestSingleApp && cheapestSplit.total != null
          ? Math.max(0, cheapestSingleApp.total - cheapestSplit.total)
          : null;

      return res.json({
        location,
        items,
        perApp: perApp.sort((a, b) => {
          if (a.total == null) return 1;
          if (b.total == null) return -1;
          return a.total - b.total;
        }),
        cheapestSingleApp,
        cheapestSplit,
        savingsVsSingle,
      });
    } catch (err) {
      logger.error('basket compare error', err);
      return res.status(500).json({ error: 'Basket comparison failed', message: 'Please try again.' });
    }
  }
);

// ────────────────────────────────────────────────────────────────
// Saved baskets — save a basket comparison result with a share link
// ────────────────────────────────────────────────────────────────

const crypto = require('crypto');

/**
 * POST /api/basket/save
 * Body: { name?, items: [...], result: {...} }
 * Saves the basket and returns a shareable link ID.
 */
router.post(
  '/save',
  authRequired,
  body('items').isArray({ min: 1, max: 15 }),
  body('items.*').isString().trim().isLength({ min: 1, max: 120 }),
  body('name').optional().isString().trim().isLength({ max: 100 }),
  body('result').isObject(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

    const { name, items, result } = req.body;
    const shareId = crypto.randomBytes(8).toString('hex');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const locationLabel = user?.location_label || null;

    db.prepare(
      `INSERT INTO saved_baskets (user_id, share_id, name, items, location_label, result_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id,
      shareId,
      name || `Basket (${items.length} items)`,
      JSON.stringify(items),
      locationLabel,
      JSON.stringify(result)
    );

    res.status(201).json({ ok: true, shareId, name: name || `Basket (${items.length} items)` });
  }
);

/**
 * GET /api/basket/saved
 * Returns all saved baskets for the current user.
 */
router.get('/saved', authRequired, (req, res) => {
  const baskets = db
    .prepare(
      `SELECT id, share_id, name, items, location_label, created_at
       FROM saved_baskets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.id);

  res.json({
    baskets: baskets.map((b) => ({
      id: b.id,
      shareId: b.share_id,
      name: b.name,
      items: JSON.parse(b.items),
      locationLabel: b.location_label,
      createdAt: b.created_at,
    })),
  });
});

/**
 * GET /api/basket/shared/:shareId
 * Public endpoint — view a shared basket by its share ID.
 */
router.get('/shared/:shareId', (req, res) => {
  const { shareId } = req.params;
  if (!shareId || shareId.length < 8) return res.status(400).json({ error: 'Invalid share ID' });

  const basket = db
    .prepare('SELECT * FROM saved_baskets WHERE share_id = ?')
    .get(shareId);

  if (!basket) return res.status(404).json({ error: 'Basket not found' });

  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(basket.user_id);

  res.json({
    shareId: basket.share_id,
    name: basket.name,
    items: JSON.parse(basket.items),
    locationLabel: basket.location_label,
    result: JSON.parse(basket.result_json),
    ownerName: owner?.name || 'Anonymous',
    createdAt: basket.created_at,
  });
});

/**
 * DELETE /api/basket/saved/:id
 * Delete a saved basket owned by the current user.
 */
router.delete('/saved/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  const info = db
    .prepare('DELETE FROM saved_baskets WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
