require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    logger.fatal('JWT_SECRET is required in production. Refusing to start.');
    process.exit(1);
  }
  logger.warn('JWT_SECRET not set, using insecure dev default. Set it in .env');
  process.env.JWT_SECRET = 'dev-insecure-secret-change-me';
}

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // frontend is served separately in dev
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
  })
);

// Structured request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms }, 'request');
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'saveqart', time: new Date().toISOString() }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const geocodeLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/search', searchLimiter, require('./routes/search'));
app.use('/api/basket', searchLimiter, require('./routes/basket'));
app.use('/api/history', require('./routes/history'));
app.use('/api/geocode', geocodeLimiter, require('./routes/geocode'));
app.use('/api/price-history', require('./routes/priceHistory'));

const { PROVIDERS, checkProviderHealth } = require('./providers');
app.get('/api/providers', (_req, res) => {
  res.json({
    providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  });
});

app.get('/api/providers/health', geocodeLimiter, async (req, res) => {
  try {
    const canary = (req.query.q || 'milk').toString().slice(0, 40);
    const report = await checkProviderHealth(canary);
    res.json(report);
  } catch (err) {
    logger.error({ err: err.message }, 'health check error');
    res.status(500).json({ error: 'Health check failed' });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// Error handler
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => logger.info(`API listening on http://localhost:${PORT}`));
