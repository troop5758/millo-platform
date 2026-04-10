#!/usr/bin/env node
'use strict';
/**
 * Standalone Kafka gift worker (scale out from API).
 *
 *   set KAFKA_ENABLED=true
 *   set KAFKA_GIFT_WORKER_ENABLED=true
 *   set KAFKA_BROKERS=localhost:9092
 *   node workers/gift.worker.js
 *
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val && process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}

if (!process.env.KAFKA_GIFT_WORKER_ENABLED) process.env.KAFKA_GIFT_WORKER_ENABLED = 'true';

const giftKafka = require('../packages/api/src/workers/giftKafka.worker.js');

giftKafka
  .start({ log: console })
  .then(({ run, consumer }) => {
    if (!consumer) {
      console.error('[workers/gift.worker] Consumer did not start (KAFKA_ENABLED / KAFKA_GIFT_WORKER_ENABLED).');
      process.exit(1);
    }
    return run;
  })
  .catch((err) => {
    console.error('[workers/gift.worker]', err);
    process.exit(1);
  });
