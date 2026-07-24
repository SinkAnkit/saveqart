const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, query, location_label, result_count, best_provider, best_price, created_at
       FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
    )
    .all(req.user.id);
  res.json({ history: rows });
});

router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  const info = db
    .prepare('DELETE FROM search_history WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.delete('/', authRequired, (req, res) => {
  db.prepare('DELETE FROM search_history WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
