#!/usr/bin/env node
/**
 * Load tests — Production Gate. Simple HTTP load against /health.
 * Run from repo root. BASE_URL default http://localhost:3000.
 * Usage: node scripts/load-test.js [concurrency] [duration_sec]
 * https://milloapp.com
 */
const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || process.env.API_URL || 'http://localhost:3000';
const CONCURRENCY = Math.min(parseInt(process.argv[2], 10) || 10, 100);
const DURATION_SEC = parseInt(process.argv[3], 10) || 10;

function fetch() {
  return new Promise((resolve, reject) => {
    const url = new URL('/health', BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const start = Date.now();
    const req = client.request(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, latency: Date.now() - start }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function runWorker(until, stats) {
  while (Date.now() < until) {
    try {
      const r = await fetch();
      stats.requests++;
      if (r.status === 200) stats.ok++; else stats.fail++;
      stats.latencies.push(r.latency);
    } catch (_) {
      stats.fail++;
    }
  }
}

async function main() {
  console.log('[load-test]', BASE_URL, 'concurrency=', CONCURRENCY, 'duration=', DURATION_SEC, 's');
  const until = Date.now() + DURATION_SEC * 1000;
  const stats = { requests: 0, ok: 0, fail: 0, latencies: [] };
  const workers = Array.from({ length: CONCURRENCY }, () => runWorker(until, stats));
  await Promise.all(workers);

  const total = stats.requests;
  const rps = total / DURATION_SEC;
  const sorted = stats.latencies.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? null;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? null;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? null;

  console.log('[load-test] requests:', total, 'ok:', stats.ok, 'fail:', stats.fail);
  console.log('[load-test] RPS:', rps.toFixed(1));
  if (sorted.length > 0) {
    console.log('[load-test] latency ms - p50:', p50, 'p95:', p95, 'p99:', p99);
  } else {
    console.log('[load-test] latency: N/A (no successful requests; ensure API is up)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
