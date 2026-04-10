/**
 * k6 example — ramp concurrent viewers (HTTP) against Millo API or CDN origin.
 * https://milloapp.com
 *
 * Usage: k6 run infra/loadtest/k6-millo.example.js
 * Env:   MILLO_BASE_URL (required for real runs; default localhost to avoid hitting prod by mistake)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.MILLO_BASE_URL || 'http://127.0.0.1:3000';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '2m', target: 10000 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { 'health 200': (r) => r.status === 200 });
  // Add HLS segment GETs against hls.milloapp.com when you have a public playlist URL:
  // http.get('https://hls.milloapp.com/live/<streamKey>/index.m3u8');
  sleep(1);
}
