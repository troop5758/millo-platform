#!/usr/bin/env node
'use strict';
/**
 * Standalone FFmpeg + Kafka worker (run outside the API process for clean scaling).
 *
 * From repo root:
 *   set KAFKA_ENABLED=true
 *   set FFMPEG_TRANSCODE_ENABLED=true
 *   set KAFKA_BROKERS=localhost:9092
 *   node workers/ffmpeg.worker.js
 *
 * Loads .env from repo root (same pattern as packages/workers).
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

if (!process.env.FFMPEG_TRANSCODE_ENABLED) process.env.FFMPEG_TRANSCODE_ENABLED = 'true';

const ffmpegWorker = require('../packages/api/src/workers/ffmpeg.worker.js');

ffmpegWorker.start({ log: console })
  .then(({ run, consumer }) => {
    if (!consumer) {
      console.error('[workers/ffmpeg.worker] Consumer did not start (check KAFKA_ENABLED / FFMPEG_TRANSCODE_ENABLED).');
      process.exit(1);
    }
    console.log('[workers/ffmpeg.worker] Listening on topic video.uploaded');
    return run;
  })
  .catch((err) => {
    console.error('[workers/ffmpeg.worker]', err);
    process.exit(1);
  });
