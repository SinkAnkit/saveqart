const logger = require('../utils/logger');
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendPasswordReset, sendEmailVerification } = require('../utils/mailer');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Set the JWT as an httpOnly cookie (not readable by JS -> XSS-safe).
function setAuthCookie(res, token) {
  res.cookie('sq_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie('sq_token', { path: '/' });
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    location: u.location_label
      ? {
          label: u.location_label,
          lat: u.location_lat,
          lng: u.location_lng,
          pincode: u.location_pincode || null,
          city: u.location_city || null,
          state: u.location_state || null,
        }
      : null,
  };
}

router.post(
  '/signup',
  body('name').isString().trim().isLength({ min: 2, max: 80 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6, max: 128 }),
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });

      const { name, email, password } = req.body;
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const hash = bcrypt.hashSync(password, 10);
      const info = db
        .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(name, email, hash);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      const token = signToken(user);
      setAuthCookie(res, token);
      return res.status(201).json({ token, user: publicUser(user) });
    } catch (error) {
      logger.error('Signup error:', error);
      return res.status(500).json({ error: 'Internal server error during signup', details: error.message });
    }
  }
);

router.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({ token, user: publicUser(user) });
  }
);

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

router.put(
  '/location',
  authRequired,
  body('label').isString().trim().isLength({ min: 2, max: 200 }),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 }),
  body('pincode').optional({ nullable: true }).isString().trim().isLength({ max: 12 }),
  body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('state').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });
    const {
      label,
      lat = null,
      lng = null,
      pincode = null,
      city = null,
      state = null,
    } = req.body;
    db.prepare(
      `UPDATE users
         SET location_label = ?, location_lat = ?, location_lng = ?,
             location_pincode = ?, location_city = ?, location_state = ?
       WHERE id = ?`
    ).run(label, lat, lng, pincode || null, city || null, state || null, req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(user) });
  }
);

const DEV = process.env.NODE_ENV !== 'production';

// ── Password reset (token-based). Without a mailer, dev returns the token in
//    the response; production would email a link and omit it. ──
router.post(
  '/forgot-password',
  body('email').isEmail().normalizeEmail(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

    const { email } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Always respond 200 so the endpoint can't be used to enumerate accounts.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 60 * 60 * 1000; // 1 hour
      db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?')
        .run(token, expires, user.id);

      // Send reset email (non-blocking — don't fail the request if email fails)
      sendPasswordReset(email, token).catch((err) => {
        logger.error({ err: err.message }, 'failed to send password reset email');
      });

      return res.json({ ok: true, ...(DEV ? { devToken: token } : {}) });
    }
    return res.json({ ok: true });
  }
);

router.post(
  '/reset-password',
  body('token').isString().isLength({ min: 16 }),
  body('password').isLength({ min: 6, max: 128 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

    const { token, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
    if (!user || !user.reset_expires || user.reset_expires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')
      .run(hash, user.id);
    return res.json({ ok: true });
  }
);

// ── Email verification (token-based). ──
router.post('/request-verification', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(token, user.id);

  sendEmailVerification(user.email, token).catch((err) => {
    logger.error({ err: err.message }, 'failed to send verification email');
  });

  return res.json({ ok: true, ...(DEV ? { devToken: token } : {}) });
});

router.post(
  '/verify-email',
  body('token').isString().isLength({ min: 16 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

    const { token } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
    if (!user) return res.status(400).json({ error: 'Invalid verification token' });

    db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
    return res.json({ ok: true });
  }
);

module.exports = router;
