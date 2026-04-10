'use strict';
/**
 * Audio Fingerprint / Copyright Scan — detect copyrighted music in uploads.
 * Providers: AudD, ACRCloud, Pex. Used to block upload, mute video, or replace audio.
 * https://milloapp.com
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

const PROVIDER = (process.env.AUDIO_COPYRIGHT_PROVIDER || '').toLowerCase();
const ACTION = (process.env.AUDIO_COPYRIGHT_ACTION || 'block').toLowerCase(); // block | allow | mute | replace

/**
 * Result of a copyright scan.
 * @typedef {{ detected: boolean, action: 'allow'|'block'|'mute'|'replace', match?: { title: string, artist: string, externalId?: string }, provider?: string, raw?: object }} ScanResult
 */

/**
 * Check if copyright scanning is configured.
 */
function isConfigured() {
  if (PROVIDER === 'audd') return !!process.env.AUDD_API_TOKEN;
  if (PROVIDER === 'acrcloud') {
    return !!(process.env.ACRCLOUD_ACCESS_KEY && process.env.ACRCLOUD_ACCESS_SECRET && process.env.ACRCLOUD_HOST);
  }
  if (PROVIDER === 'pex') return !!process.env.PEX_API_KEY;
  return false;
}

/**
 * Scan an audio buffer for copyrighted music. Call before accepting upload.
 * @param {Buffer} buffer - Audio file contents
 * @param {string} [contentType] - e.g. 'audio/mpeg'
 * @returns {Promise<ScanResult>}
 */
async function scanBuffer(buffer, contentType = 'audio/mpeg') {
  if (!buffer || buffer.length === 0) return { detected: false, action: 'allow' };
  if (!isConfigured()) return { detected: false, action: 'allow' };

  if (PROVIDER === 'audd') return scanAudD(buffer, contentType);
  if (PROVIDER === 'acrcloud') return scanACRCloud(buffer);
  if (PROVIDER === 'pex') return scanPex(buffer, contentType);

  return { detected: false, action: 'allow' };
}

/**
 * Scan an audio URL for copyrighted music (e.g. for POST /music with external URL).
 * @param {string} audioUrl - Public URL to the audio file
 * @returns {Promise<ScanResult>}
 */
async function scanByUrl(audioUrl) {
  if (!audioUrl || !audioUrl.startsWith('http')) return { detected: false, action: 'allow' };
  if (!isConfigured()) return { detected: false, action: 'allow' };

  if (PROVIDER === 'audd') return scanAudDByUrl(audioUrl);
  if (PROVIDER === 'acrcloud') {
    const res = await fetchBuffer(audioUrl);
    if (!res) return { detected: false, action: 'allow' };
    return scanACRCloud(res);
  }
  if (PROVIDER === 'pex') return scanPexByUrl(audioUrl);

  return { detected: false, action: 'allow' };
}

/**
 * Resolve action for a positive detection (block upload, or allow but flag for mute/replace).
 */
function getAction(result) {
  if (!result.detected) return 'allow';
  return ACTION;
}

// ─── AudD ───────────────────────────────────────────────────────────────────
function buildMultipart(boundary, parts) {
  const bufs = [];
  for (const p of parts) {
    bufs.push(Buffer.from(`--${boundary}\r\n${p.header}\r\n\r\n`, 'utf8'));
    bufs.push(Buffer.isBuffer(p.body) ? p.body : Buffer.from(String(p.body), 'utf8'));
    bufs.push(Buffer.from('\r\n', 'utf8'));
  }
  bufs.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(bufs);
}

async function scanAudD(buffer, contentType) {
  const token = process.env.AUDD_API_TOKEN;
  if (!token) return { detected: false, action: 'allow' };

  const boundary = crypto.randomBytes(16).toString('hex');
  const body = buildMultipart(boundary, [
    { header: 'Content-Disposition: form-data; name="api_token"', body: token },
    { header: `Content-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: ${contentType}`, body },
  ]);

  const res = await post('https://api.audd.io/', {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  }, body);
  if (!res.body) return { detected: false, action: 'allow' };
  const data = parseJson(res.body);
  return parseAudDResult(data);
}

async function scanAudDByUrl(audioUrl) {
  const token = process.env.AUDD_API_TOKEN;
  if (!token) return { detected: false, action: 'allow' };
  const body = new URLSearchParams({ url: audioUrl, api_token: token }).toString();
  const res = await post('https://api.audd.io/', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
  }, Buffer.from(body));
  if (!res.body) return { detected: false, action: 'allow' };
  const data = parseJson(res.body);
  return parseAudDResult(data);
}

function parseAudDResult(data) {
  if (!data || data.status === 'error') return { detected: false, action: 'allow', raw: data };
  const result = data.result;
  if (result == null || (Array.isArray(result) && result.length === 0)) return { detected: false, action: 'allow', raw: data };
  const hit = Array.isArray(result) ? result[0] : result;
  const title = hit.title || hit.song_title;
  const artist = hit.artist || hit.artist_name;
  if (title || artist) {
    return {
      detected: true,
      action: getAction({ detected: true }),
      match: { title: title || '', artist: artist || '', externalId: hit.song_link || hit.id },
      provider: 'audd',
      raw: data,
    };
  }
  return { detected: false, action: 'allow', raw: data };
}

// ─── ACRCloud ───────────────────────────────────────────────────────────────
function acrcloudSignature(accessKey, secret, host, timestamp) {
  const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`;
  const sig = crypto.createHmac('sha1', secret).update(stringToSign).digest('base64');
  return sig;
}

async function scanACRCloud(buffer) {
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
  const secret = process.env.ACRCLOUD_ACCESS_SECRET;
  const host = process.env.ACRCLOUD_HOST || 'identify-eu-west-1.acrcloud.com';
  if (!accessKey || !secret) return { detected: false, action: 'allow' };

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = acrcloudSignature(accessKey, secret, host, timestamp);
  const boundary = crypto.randomBytes(16).toString('hex');
  const body = buildMultipart(boundary, [
    { header: 'Content-Disposition: form-data; name="access_key"', body: accessKey },
    { header: 'Content-Disposition: form-data; name="signature_version"', body: '1' },
    { header: 'Content-Disposition: form-data; name="signature"', body: signature },
    { header: 'Content-Disposition: form-data; name="sample_bytes"', body: String(buffer.length) },
    { header: 'Content-Disposition: form-data; name="timestamp"', body: String(timestamp) },
    { header: 'Content-Disposition: form-data; name="data_type"', body: 'audio' },
    { header: 'Content-Disposition: form-data; name="sample"; filename="audio.mp3"\r\nContent-Type: application/octet-stream', body },
  ]);

  const res = await post(`https://${host}/v1/identify`, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  }, body);
  if (!res.body) return { detected: false, action: 'allow' };
  const data = parseJson(res.body);
  return parseACRCloudResult(data);
}

function parseACRCloudResult(data) {
  if (!data || data.status?.code !== 0) return { detected: false, action: 'allow', raw: data };
  const music = data.metadata?.music;
  if (!music || !Array.isArray(music) || music.length === 0) return { detected: false, action: 'allow', raw: data };
  const hit = music[0];
  const title = hit.title;
  const artist = hit.artists?.[0]?.name || hit.artists?.[0];
  const externalId = hit.acr_id || hit.external_ids?.isrc;
  if (title || artist) {
    return {
      detected: true,
      action: getAction({ detected: true }),
      match: { title: title || '', artist: artist || '', externalId },
      provider: 'acrcloud',
      raw: data,
    };
  }
  return { detected: false, action: 'allow', raw: data };
}

// ─── Pex (stub — use Pex API when key is set) ──────────────────────────────────
async function scanPex(buffer, _contentType) {
  const key = process.env.PEX_API_KEY;
  if (!key) return { detected: false, action: 'allow' };
  // Pex typically uses a different flow (e.g. submit asset, get report). Stub: no scan unless documented.
  try {
    const res = await post('https://api.pex.com/v1/audio/scan', {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
    }, buffer);
    const data = res.body ? parseJson(res.body) : null;
    if (data && data.matched && data.matched.length > 0) {
      const m = data.matched[0];
      return {
        detected: true,
        action: getAction({ detected: true }),
        match: { title: m.title || '', artist: m.artist || '', externalId: m.id },
        provider: 'pex',
        raw: data,
      };
    }
  } catch (_) {
    // Pex endpoint/format may differ; treat as no match
  }
  return { detected: false, action: 'allow' };
}

async function scanPexByUrl(audioUrl) {
  const key = process.env.PEX_API_KEY;
  if (!key) return { detected: false, action: 'allow' };
  try {
    const res = await post('https://api.pex.com/v1/audio/scan', {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }, Buffer.from(JSON.stringify({ url: audioUrl })));
    const data = res.body ? parseJson(res.body) : null;
    if (data && data.matched && data.matched.length > 0) {
      const m = data.matched[0];
      return {
        detected: true,
        action: getAction({ detected: true }),
        match: { title: m.title || '', artist: m.artist || '', externalId: m.id },
        provider: 'pex',
        raw: data,
      };
    }
  } catch (_) {}
  return { detected: false, action: 'allow' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseJson(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}

function post(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = { method: 'POST', hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, headers };
    const req = (url.protocol === 'https:' ? https : http).request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Copyright scan timeout')); });
    req.end(body);
  });
}

function fetchBuffer(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const opts = { hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search };
    const req = (url.protocol === 'https:' ? https : http).get(opts, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

module.exports = {
  isConfigured,
  scanBuffer,
  scanByUrl,
  getAction,
  PROVIDER,
  ACTION,
};
