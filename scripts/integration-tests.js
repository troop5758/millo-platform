#!/usr/bin/env node
/**
 * Integration tests - Production Gate. Key flows and API contract.
 * Run from repo root. Set BASE_URL for live API (default http://localhost:3000).
 * https://milloapp.com
 */
const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || process.env.API_URL || 'http://localhost:3000';

function request(path, options) {
  options = options || {};
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method: options.method || 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runIntegrationTests() {
  const results = [];
  let passed = 0;

  try {
    const health = await request('/health');
    const ok = health.status === 200 && health.body && health.body.includes('ok');
    results.push({ name: 'GET /health', pass: ok });
    if (ok) passed++;
  } catch (e) {
    results.push({ name: 'GET /health', pass: false, error: e.message });
  }

  try {
    const res = await request('/health');
    const csp = res.headers['content-security-policy'];
    const hsts = res.headers['strict-transport-security'];
    const ok = (csp && csp.length > 0) && (hsts && hsts.length > 0);
    results.push({ name: 'Security headers (CSP, HSTS)', pass: ok });
    if (ok) passed++;
  } catch (e) {
    results.push({ name: 'Security headers', pass: false, error: e.message });
  }

  try {
    const res = await request('/security/ledger-integrity');
    const ok = res.status === 200 && res.body && (res.body.includes('valid') || res.body.includes('not_available'));
    results.push({ name: 'GET /security/ledger-integrity', pass: ok });
    if (ok) passed++;
  } catch (e) {
    results.push({ name: 'GET /security/ledger-integrity', pass: false, error: e.message });
  }

  try {
    const res = await request('/security/kill-switches');
    const ok = res.status === 200 && res.body && res.body.includes('ADS_ENABLED');
    results.push({ name: 'GET /security/kill-switches', pass: ok });
    if (ok) passed++;
  } catch (e) {
    results.push({ name: 'GET /security/kill-switches', pass: false, error: e.message });
  }

  try {
    const res = await request('/observation/recommendations');
    const ok = res.status === 200 && res.body && res.body.includes('recommendations');
    results.push({ name: 'GET /observation/recommendations', pass: ok });
    if (ok) passed++;
  } catch (e) {
    results.push({ name: 'GET /observation/recommendations', pass: false, error: e.message });
  }

  return { results, passed, total: results.length };
}

async function main() {
  console.log('[integration-tests] BASE_URL:', BASE_URL);
  const { results, passed, total } = await runIntegrationTests();
  for (const r of results) {
    console.log(r.pass ? '  OK' : '  FAIL', r.name, r.error ? r.error : '');
  }
  console.log('[integration-tests]', passed, '/', total, 'passed');
  if (passed < total) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
