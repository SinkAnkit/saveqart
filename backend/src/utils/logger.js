const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {} // JSON output in production (machine-readable)
    : { transport: { target: 'pino/file', options: { destination: 1 } } }),
});

module.exports = logger;
