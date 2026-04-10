'use strict';
/**
 * AI Moderation — provider pipeline (OpenAI + Hive + AWS Rekognition).
 * Off by default; enable with AI_MODERATION_ENABLED=true and provider credentials.
 * Pipeline: upload (URL) -> scan -> moderation decision.
 * https://milloapp.com
 */
const OpenAI = require('openai');
const abuseDetection = require('./abuseDetection.service');

const AI_ENABLED = process.env.AI_MODERATION_ENABLED === 'true';
const OPENAI_ENABLED = AI_ENABLED && !!process.env.OPENAI_API_KEY;
const HIVE_ENABLED = AI_ENABLED && !!process.env.HIVE_API_KEY;
const REKOGNITION_ENABLED = AI_ENABLED && !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;

const openai = OPENAI_ENABLED ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const DEFAULT_MODEL = 'omni-moderation-latest';
const DEFAULT_BLOCK_THRESHOLD = Number(process.env.MODERATION_BLOCK_THRESHOLD || 0.8);
const DEFAULT_REVIEW_THRESHOLD = Number(process.env.MODERATION_REVIEW_THRESHOLD || 0.5);

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isFlagCategory(name) {
  const s = String(name || '').toLowerCase();
  return (
    s.includes('sexual') ||
    s.includes('nudity') ||
    s.includes('violence') ||
    s.includes('hate') ||
    s.includes('harassment') ||
    s.includes('self_harm') ||
    s.includes('drugs') ||
    s.includes('weapons') ||
    s.includes('graphic')
  );
}

async function scanWithOpenAIText(text) {
  if (!OPENAI_ENABLED || !openai) return null;
  const res = await openai.moderations.create({
    model: DEFAULT_MODEL,
    input: text,
  });
  const r = res.results?.[0];
  const scoreMap = r?.category_scores || {};
  let maxScore = 0;
  const categories = [];
  for (const [k, v] of Object.entries(scoreMap)) {
    const score = clamp01(v);
    if (isFlagCategory(k) && score > 0) {
      categories.push({ category: k, score });
      if (score > maxScore) maxScore = score;
    }
  }
  return {
    provider: 'openai',
    flagged: !!r?.flagged,
    confidence: Math.max(maxScore, r?.flagged ? 0.8 : 0),
    categories,
    raw: r,
  };
}

async function scanWithHive(mediaUrl, mediaType) {
  if (!HIVE_ENABLED || !mediaUrl) return null;
  const endpoint = process.env.HIVE_API_URL || 'https://api.thehive.ai/api/v2/task/sync';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.HIVE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: mediaType === 'image' ? mediaUrl : undefined,
      video_url: mediaType === 'video' ? mediaUrl : undefined,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const classes = data?.status?.[0]?.response?.output?.[0]?.classes || [];
  let confidence = 0;
  const categories = [];
  for (const c of classes) {
    const label = c?.class || c?.label || '';
    const score = clamp01(c?.score);
    if (isFlagCategory(label) && score > 0) {
      categories.push({ category: label, score });
      if (score > confidence) confidence = score;
    }
  }
  return {
    provider: 'hive',
    flagged: confidence >= DEFAULT_REVIEW_THRESHOLD,
    confidence,
    categories,
    raw: data,
  };
}

async function scanWithRekognition(mediaUrl) {
  if (!REKOGNITION_ENABLED || !mediaUrl) return null;
  try {
    const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
    const region = process.env.AWS_REGION || 'us-east-1';
    const client = new RekognitionClient({ region });

    const u = new URL(mediaUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const bucket = process.env.MODERATION_S3_BUCKET || u.hostname.split('.')[0];
    const key = parts.join('/');
    const cmd = new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MinConfidence: 50,
    });
    const out = await client.send(cmd);
    const labels = out.ModerationLabels || [];
    let confidence = 0;
    const categories = labels.map((l) => {
      const score = clamp01((l.Confidence || 0) / 100);
      if (score > confidence) confidence = score;
      return { category: l.Name, score };
    });
    return {
      provider: 'aws_rekognition',
      flagged: confidence >= DEFAULT_REVIEW_THRESHOLD,
      confidence,
      categories,
      raw: out,
    };
  } catch {
    return null;
  }
}

function buildDecision(scans = []) {
  if (!scans.length) return { decision: 'allow', confidence: 0 };
  let maxConfidence = 0;
  const categories = [];
  for (const s of scans) {
    maxConfidence = Math.max(maxConfidence, clamp01(s.confidence));
    for (const c of (s.categories || [])) categories.push(c);
  }
  if (maxConfidence >= DEFAULT_BLOCK_THRESHOLD) return { decision: 'block', confidence: maxConfidence, categories };
  if (maxConfidence >= DEFAULT_REVIEW_THRESHOLD) return { decision: 'review', confidence: maxConfidence, categories };
  return { decision: 'allow', confidence: maxConfidence, categories };
}

/**
 * Moderate text via OpenAI Moderation API.
 * @param {string|string[]} input - Text or array of texts to moderate
 * @param {{ model?: string }} [opts]
 * @returns {Promise<{ id: string, model: string, results: Array<{ flagged: boolean, categories: object, category_scores: object }> }>}
 */
async function moderate(input, opts = {}) {
  const text = Array.isArray(input) ? input : [String(input || '').trim()];
  const valid = text.filter((t) => t.length > 0);
  if (valid.length === 0) throw new Error('INPUT_REQUIRED');

  // Rule-based abuse detection (fast pre-filter)
  if (valid.some((t) => abuseDetection.detectAbuse(t))) {
    return {
      id: 'abuse-detection',
      model: 'rule-based',
      results: valid.map(() => ({ flagged: true, categories: { abuse: true }, category_scores: { abuse: 1 } })),
    };
  }

  if (!OPENAI_ENABLED || !openai) {
    throw new Error('AI_MODERATION_DISABLED');
  }

  const res = await openai.moderations.create({
    model: opts.model || DEFAULT_MODEL,
    input: valid.length === 1 ? valid[0] : valid,
  });
  return res;
}

/**
 * Check if text is flagged. Convenience wrapper.
 * @param {string} text
 * @returns {Promise<{ flagged: boolean, result?: object }>}
 */
async function isFlagged(text) {
  if (abuseDetection.detectAbuse(text)) return { flagged: true };
  if (!OPENAI_ENABLED || !openai) return { flagged: false };
  try {
    const result = await moderate(text);
    const r = result.results?.[0];
    return { flagged: !!r?.flagged, result: r };
  } catch {
    return { flagged: false };
  }
}

/**
 * Queue content for human review (shadow moderation when AI disabled).
 */
async function queueForHumanReview(payload) {
  const db = require('@millo/database');
  const contentId = payload.contentId || `mod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await db.ModerationQueue.create({
    contentId,
    contentType: payload.contentType || (payload.mediaUrl ? 'media' : 'text'),
    contentUrl: payload.mediaUrl || null,
    uploaderId: payload.uploaderId || null,
    reason: 'ai_moderation_disabled',
    status: 'pending',
    meta: { textLength: payload.text?.length, hasMedia: !!payload.mediaUrl },
  }).catch(() => {});
  return contentId;
}

/**
 * Upload -> scan -> moderation decision pipeline.
 * When AI disabled: shadow moderation — queue to moderation_queue for human review and return decision 'review'.
 * @param {{ text?:string, mediaUrl?:string, mediaType?:'image'|'video', contentId?:string, contentType?:string, uploaderId?:string }} payload
 */
async function moderateUpload(payload = {}) {
  const text = payload.text ? String(payload.text).trim() : '';
  const mediaUrl = payload.mediaUrl ? String(payload.mediaUrl).trim() : '';
  const mediaType = payload.mediaType === 'video' ? 'video' : 'image';
  const scans = [];

  if (text) {
    if (abuseDetection.detectAbuse(text)) {
      scans.push({
        provider: 'rule-based',
        flagged: true,
        confidence: 1,
        categories: [{ category: 'abuse', score: 1 }],
      });
    } else if (OPENAI_ENABLED && openai) {
      const openaiScan = await scanWithOpenAIText(text).catch(() => null);
      if (openaiScan) scans.push(openaiScan);
    }
  }

  if (mediaUrl && (HIVE_ENABLED || REKOGNITION_ENABLED)) {
    const [hiveScan, rekognitionScan] = await Promise.all([
      HIVE_ENABLED ? scanWithHive(mediaUrl, mediaType).catch(() => null) : Promise.resolve(null),
      mediaType === 'image' && REKOGNITION_ENABLED ? scanWithRekognition(mediaUrl).catch(() => null) : Promise.resolve(null),
    ]);
    if (hiveScan) scans.push(hiveScan);
    if (rekognitionScan) scans.push(rekognitionScan);
  }

  let queued = false;
  if (scans.length === 0 && (text || mediaUrl)) {
    const contentId = await queueForHumanReview({
      ...payload,
      contentId: payload.contentId || undefined,
      mediaUrl: mediaUrl || undefined,
      text,
      uploaderId: payload.uploaderId,
    });
    queued = !!contentId;
  }

  const decision = scans.length > 0 ? buildDecision(scans) : { decision: queued ? 'review' : 'allow', confidence: 0, categories: [] };
  return {
    contentType: payload.contentType || null,
    contentId: payload.contentId || null,
    uploaded: !!mediaUrl,
    scanned: scans.length > 0,
    providers: scans.map((s) => s.provider),
    scans,
    decision,
    queued,
  };
}

function isEnabled() {
  return AI_ENABLED;
}

function isProviderEnabled() {
  return {
    openai: OPENAI_ENABLED,
    hive: HIVE_ENABLED,
    awsRekognition: REKOGNITION_ENABLED,
  };
}

module.exports = { moderate, isFlagged, moderateUpload, isEnabled, isProviderEnabled, queueForHumanReview };
