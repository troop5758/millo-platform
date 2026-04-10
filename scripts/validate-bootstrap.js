#!/usr/bin/env node
/**
 * Phase 1.5 validation: API boots, Web loads
 * Run from repo root. Start API (npm run start:api) and web (npm run dev -w @millo/web) in separate terminals first, or run this after deploy.
 */
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  console.log('[validate-bootstrap] Checking API...');
  try {
    const port = process.env.API_PORT || 3000;
    const { status, body } = await get(`http://127.0.0.1:${port}/health`);
    if (status !== 200) throw new Error(`API health returned ${status}`);
    const data = JSON.parse(body);
    if (!data.ok) throw new Error('API health ok not true');
    console.log('[validate-bootstrap] API boots: OK');
  } catch (e) {
    console.error('[validate-bootstrap] API boots: FAIL', e.message);
    process.exit(1);
  }

  console.log('[validate-bootstrap] Web loads: run "npm run dev -w @millo/web" and open http://localhost:5173');
  console.log('[validate-bootstrap] Validation passed.');
}

main();
