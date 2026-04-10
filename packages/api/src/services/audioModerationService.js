'use strict';
/**
 * Audio Moderation Layer — prevent abusive audio uploads.
 * Detection: copyright (handled by copyrightScanService), hate speech, adult audio.
 * Providers: OpenAI (Whisper + Moderation), Hive AI, AssemblyAI.
 * https://milloapp.com
 */
const { Readable } = require('stream');

const ENABLED = process.env.AI_AUDIO_MODERATION_ENABLED === 'true';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const HIVE_KEY = process.env.HIVE_API_KEY;
const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;
const HIVE_API_URL = process.env.HIVE_API_URL || 'https://api.thehive.ai/api/v2/task/sync';
const ASSEMBLYAI_BASE = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com';
const BLOCK_THRESHOLD = Number(process.env.AUDIO_MODERATION_BLOCK_THRESHOLD) || 0.7;
const REVIEW_THRESHOLD = Number(process.env.AUDIO_MODERATION_REVIEW_THRESHOLD) || 0.4;

function isConfigured() {
  return ENABLED && (OPENAI_KEY || HIVE_KEY || ASSEMBLYAI_KEY);
}

/**
 * @typedef {{ flagged: boolean, decision: 'allow'|'block'|'review', reason?: string, provider?: string, categories?: Array<{category:string,score:number}>, confidence?: number }} AudioModerationResult
 */

/**
 * Scan audio buffer for hate speech, adult content. Call after copyright scan.
 * @param {Buffer} buffer - Audio file contents
 * @param {string} [contentType] - e.g. 'audio/mpeg'
 * @returns {Promise<AudioModerationResult>}
 */
async function scanAudio(buffer, contentType = 'audio/mpeg') {
  if (!buffer || buffer.length === 0) return { flagged: false, decision: 'allow' };
  if (!isConfigured()) return { flagged: false, decision: 'allow' };

  const scans = [];
  if (OPENAI_KEY) {
    const r = await scanWithOpenAI(buffer, contentType).catch(() => null);
    if (r) scans.push(r);
  }
  if (HIVE_KEY) {
    const r = await scanWithHive(buffer, contentType).catch(() => null);
    if (r) scans.push(r);
  }
  if (ASSEMBLYAI_KEY) {
    const r = await scanWithAssemblyAI(buffer, contentType).catch(() => null);
    if (r) scans.push(r);
  }

  return buildDecision(scans);
}

/**
 * Scan audio by URL (e.g. for POST /music with external URL).
 * @param {string} audioUrl
 * @returns {Promise<AudioModerationResult>}
 */
async function scanAudioByUrl(audioUrl) {
  if (!audioUrl || !audioUrl.startsWith('http')) return { flagged: false, decision: 'allow' };
  if (!isConfigured()) return { flagged: false, decision: 'allow' };

  const scans = [];
  if (OPENAI_KEY) {
    const r = await scanWithOpenAIByUrl(audioUrl).catch(() => null);
    if (r) scans.push(r);
  }
  if (HIVE_KEY) {
    const r = await scanWithHiveByUrl(audioUrl).catch(() => null);
    if (r) scans.push(r);
  }
  if (ASSEMBLYAI_KEY) {
    const r = await scanWithAssemblyAIByUrl(audioUrl).catch(() => null);
    if (r) scans.push(r);
  }

  return buildDecision(scans);
}

function buildDecision(scans) {
  if (!scans.length) return { flagged: false, decision: 'allow' };
  let maxConf = 0;
  let reason = '';
  const categories = [];
  for (const s of scans) {
    const c = Number(s.confidence) || 0;
    if (c > maxConf) {
      maxConf = c;
      reason = s.reason || '';
    }
    for (const cat of s.categories || []) categories.push(cat);
  }
  const flagged = maxConf >= REVIEW_THRESHOLD;
  const decision = maxConf >= BLOCK_THRESHOLD ? 'block' : flagged ? 'review' : 'allow';
  return {
    flagged,
    decision,
    reason: reason || (decision !== 'allow' ? 'hate_speech_or_adult' : undefined),
    provider: scans.map((s) => s.provider).filter(Boolean).join(','),
    categories,
    confidence: maxConf,
  };
}

// ─── OpenAI: Whisper transcribe + Moderation API ───────────────────────────
async function scanWithOpenAI(buffer, contentType) {
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const stream = Readable.from(buffer);
    stream.path = 'audio.mp3';
    const transcriptRes = await openai.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
    });
    const text = (transcriptRes?.text || '').trim();
    if (!text) return { provider: 'openai', flagged: false, confidence: 0, categories: [] };

    const mod = await openai.moderations.create({ input: text });
    const r = mod.results?.[0];
    const scores = r?.category_scores || {};
    const hate = Number(scores.hate ?? 0);
    const sexual = Number(scores['sexual/minors'] ?? 0) + Number(scores.sexual ?? 0);
    const violence = Number(scores.violence ?? 0);
    const confidence = Math.max(hate, sexual, violence);
    const categories = [];
    if (hate > 0.2) categories.push({ category: 'hate_speech', score: hate });
    if (sexual > 0.2) categories.push({ category: 'adult', score: sexual });
    if (violence > 0.2) categories.push({ category: 'violence', score: violence });
    const reason = hate >= REVIEW_THRESHOLD ? 'hate_speech' : sexual >= REVIEW_THRESHOLD ? 'adult' : violence >= REVIEW_THRESHOLD ? 'violence' : '';
    return { provider: 'openai', flagged: !!r?.flagged || confidence >= REVIEW_THRESHOLD, confidence, categories, reason };
  } catch {
    return null;
  }
}

async function scanWithOpenAIByUrl(audioUrl) {
  const res = await fetch(audioUrl, { method: 'GET' });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return scanWithOpenAI(buffer, res.headers.get('content-type') || 'audio/mpeg');
}

// ─── Hive AI: speech moderation (audio_url or multipart media) ──────────────
async function scanWithHive(buffer, contentType) {
  const boundary = '----HiveAudio' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="audio.mp3"\r\nContent-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(HIVE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${HIVE_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return parseHiveResponse(data);
}

async function scanWithHiveByUrl(audioUrl) {
  const res = await fetch(HIVE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${HIVE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: audioUrl }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return parseHiveResponse(data);
}

function parseHiveResponse(data) {
  const classes = data?.status?.[0]?.response?.output?.[0]?.classes || [];
  let confidence = 0;
  const categories = [];
  const reasonMap = { sexual: 'adult', hate: 'hate_speech', violence: 'violence', bullying: 'hate_speech' };
  let reason = '';
  for (const c of classes) {
    const label = (c?.class || c?.label || '').toLowerCase();
    const score = Math.max(0, Math.min(1, Number(c?.score) || 0));
    if (['sexual', 'hate', 'violence', 'bullying'].some((k) => label.includes(k)) && score > 0.2) {
      categories.push({ category: reasonMap[label] || label, score });
      if (score > confidence) {
        confidence = score;
        reason = reasonMap[label] || label;
      }
    }
  }
  return {
    provider: 'hive',
    flagged: confidence >= REVIEW_THRESHOLD,
    confidence,
    categories,
    reason,
  };
}

// ─── AssemblyAI: upload + transcript with content_safety ───────────────────
async function scanWithAssemblyAI(buffer, contentType) {
  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/v2/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Authorization: ASSEMBLYAI_KEY,
    },
    body: buffer,
  });
  if (!uploadRes.ok) return null;
  const { upload_url } = await uploadRes.json().catch(() => ({}));
  if (!upload_url) return null;

  const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ASSEMBLYAI_KEY,
    },
    body: JSON.stringify({
      audio_url: upload_url,
      content_safety: true,
    }),
  });
  if (!transcriptRes.ok) return null;
  const transcript = await transcriptRes.json().catch(() => null);
  const id = transcript?.id;
  if (!id) return null;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript/${id}`, {
      headers: { Authorization: ASSEMBLYAI_KEY },
    });
    const statusData = await statusRes.json().catch(() => null);
    if (statusData?.status === 'completed') return parseAssemblyAIResponse(statusData);
    if (statusData?.status === 'error') return null;
  }
  return null;
}

async function scanWithAssemblyAIByUrl(audioUrl) {
  const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ASSEMBLYAI_KEY,
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      content_safety: true,
    }),
  });
  if (!transcriptRes.ok) return null;
  const transcript = await transcriptRes.json().catch(() => null);
  const id = transcript?.id;
  if (!id) return null;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${ASSEMBLYAI_BASE}/v2/transcript/${id}`, {
      headers: { Authorization: ASSEMBLYAI_KEY },
    });
    const statusData = await statusRes.json().catch(() => null);
    if (statusData?.status === 'completed') return parseAssemblyAIResponse(statusData);
    if (statusData?.status === 'error') return null;
  }
  return null;
}

function parseAssemblyAIResponse(data) {
  const summary = data?.content_safety_labels?.summary || {};
  let confidence = 0;
  const categories = [];
  const reasonMap = { hate_speech: 'hate_speech', sexual: 'adult', violence: 'violence' };
  let reason = '';
  for (const [label, val] of Object.entries(summary)) {
    const score = Math.max(0, Math.min(1, Number(val) || 0));
    if (score > 0.2 && (label.includes('hate') || label.includes('sexual') || label.includes('violence'))) {
      const cat = reasonMap[label] || label;
      categories.push({ category: cat, score });
      if (score > confidence) {
        confidence = score;
        reason = cat;
      }
    }
  }
  const results = data?.content_safety_labels?.results || [];
  for (const r of results) {
    const labels = r?.labels || [];
    for (const l of labels) {
      const score = Math.max(0, Math.min(1, Number(l?.confidence) || 0));
      if (score > confidence) confidence = score;
    }
  }
  return {
    provider: 'assemblyai',
    flagged: confidence >= REVIEW_THRESHOLD,
    confidence,
    categories: categories.length ? categories : (confidence > 0 ? [{ category: 'content_safety', score: confidence }] : []),
    reason: reason || (confidence >= REVIEW_THRESHOLD ? 'hate_speech_or_adult' : ''),
  };
}

module.exports = {
  isConfigured,
  scanAudio,
  scanAudioByUrl,
};
