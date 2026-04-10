'use strict';
/**
 * Winston logger — Console + File transports; optional Loki/Elastic for aggregation.
 * https://milloapp.com
 */
const path = require('path');
const fs = require('fs');
const winston = require('winston');

const logsDir = path.join(__dirname, '..', '..', 'logs');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch {
  // ignore if exists or permission error
}

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
  new winston.transports.File({ filename: path.join(logsDir, 'app.log') }),
];

const LOG_LOKI_ENABLED = process.env.LOG_LOKI_ENABLED === 'true';
const LOG_LOKI_HOST = process.env.LOG_LOKI_HOST || process.env.LOKI_HOST;
if (LOG_LOKI_ENABLED && LOG_LOKI_HOST) {
  try {
    const LokiTransport = require('winston-loki');
    transports.push(
      new LokiTransport({
        host: LOG_LOKI_HOST.replace(/\/$/, ''),
        labels: { app: 'millo-api', env: process.env.NODE_ENV || 'development' },
        json: true,
      })
    );
  } catch (e) {
    console.error('[logger] winston-loki failed to load:', e.message);
  }
}

const LOG_ELASTIC_ENABLED = process.env.LOG_ELASTIC_ENABLED === 'true';
const LOG_ELASTIC_NODE = process.env.LOG_ELASTIC_NODE || process.env.ELASTICSEARCH_NODE;
if (LOG_ELASTIC_ENABLED && LOG_ELASTIC_NODE) {
  try {
    const { ElasticsearchTransport } = require('winston-elasticsearch');
    transports.push(
      new ElasticsearchTransport({
        level: process.env.LOG_LEVEL || 'info',
        indexPrefix: process.env.LOG_ELASTIC_INDEX_PREFIX || 'millo-api',
        clientOpts: {
          node: LOG_ELASTIC_NODE,
          auth: process.env.LOG_ELASTIC_USERNAME
            ? {
                username: process.env.LOG_ELASTIC_USERNAME,
                password: process.env.LOG_ELASTIC_PASSWORD || '',
              }
            : undefined,
        },
      })
    );
  } catch (e) {
    console.error('[logger] winston-elasticsearch failed to load:', e.message);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'millo-api' },
  transports,
});

module.exports = logger;
