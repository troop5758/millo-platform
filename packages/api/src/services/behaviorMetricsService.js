'use strict';
/**
 * Behavioral Biometrics — track and analyze human interaction patterns (mouse, scroll, typing, session).
 * Bot patterns: exact intervals, straight lines, identical duration. Human: irregular, curves, variable.
 * https://milloapp.com
 */
const db = require('@millo/database');

const BEHAVIOR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MIN_SAMPLES_FOR_ANALYSIS = 5;

/** Allowed event types for trackBehavior. */
const ALLOWED_EVENT_TYPES = Object.freeze([
  'mouse_move',      // { x, y, speed }
  'touch_move',      // { x, y, speed } — same shape as mouse; mobile
  'scroll_speed',   // { velocity }
  'typing_latency', // { interval }
  'session_duration', // { duration }
  // Legacy / alias
  'scroll', 'mousemove', 'click', 'video_watch', 'like', 'comment', 'share',
]);

/**
 * Normalize payload for event type (whitelist known fields).
 */
function normalizePayload(eventType, payload) {
  if (!payload || typeof payload !== 'object') return {};
  const p = {};
  switch (eventType) {
    case 'mouse_move':
    case 'touch_move':
      if (typeof payload.x === 'number') p.x = payload.x;
      if (typeof payload.y === 'number') p.y = payload.y;
      if (typeof payload.speed === 'number') p.speed = payload.speed;
      break;
    case 'scroll_speed':
      if (typeof payload.velocity === 'number') p.velocity = payload.velocity;
      break;
    case 'typing_latency':
      if (typeof payload.interval === 'number') p.interval = payload.interval;
      break;
    case 'session_duration':
      if (typeof payload.duration === 'number') p.duration = payload.duration;
      break;
    default:
      p.raw = payload;
  }
  return p;
}

/**
 * Track a behavior metric. Stores in BehaviorEvent with eventType and metadata.
 * @param {string} userId - Optional; can be null for anonymous.
 * @param {string} eventType - e.g. "mouse_move", "scroll_speed", "typing_latency", "session_duration"
 * @param {object} payload - { x, y, speed } | { velocity } | { interval } | { duration }
 * @param {object} opts - { sessionId, timestamp }
 */
async function trackBehavior(userId, eventType, payload, opts = {}) {
  const type = String(eventType).slice(0, 64);
  if (!ALLOWED_EVENT_TYPES.includes(type)) {
    return null;
  }
  const metadata = normalizePayload(type, payload && typeof payload === 'object' ? payload : {});
  const event = await db.BehaviorEvent.create({
    userId: userId || null,
    eventType: type,
    metadata,
    timestamp: opts.timestamp ? new Date(opts.timestamp) : new Date(),
    sessionId: opts.sessionId || null,
  });
  return event;
}

/**
 * Compute a simple human-likeness score 0–100 from recent behavioral biometrics.
 * High variance in intervals/velocity/speed => human. Very uniform => bot.
 */
async function analyzeBehaviorMetrics(userId, windowMs = BEHAVIOR_WINDOW_MS) {
  if (!userId) return { score: 50, signals: [], sampleCount: 0 };
  const uid = userId.toString?.() || userId;
  const since = new Date(Date.now() - windowMs);

  const events = await db.BehaviorEvent.find({
    userId: uid,
    timestamp: { $gte: since },
    eventType: { $in: ['mouse_move', 'scroll_speed', 'typing_latency', 'session_duration'] },
  })
    .sort({ timestamp: 1 })
    .limit(500)
    .lean();

  if (events.length < MIN_SAMPLES_FOR_ANALYSIS) {
    return { score: 50, signals: ['insufficient_samples'], sampleCount: events.length };
  }

  const signals = [];
  let humanScore = 50;

  const intervals = [];
  const velocities = [];
  const speeds = [];
  const durations = [];

  for (const e of events) {
    const m = e.metadata || {};
    if (e.eventType === 'typing_latency' && typeof m.interval === 'number') intervals.push(m.interval);
    if (e.eventType === 'scroll_speed' && typeof m.velocity === 'number') velocities.push(m.velocity);
    if ((e.eventType === 'mouse_move' || e.eventType === 'touch_move') && typeof m.speed === 'number') speeds.push(m.speed);
    if (e.eventType === 'session_duration' && typeof m.duration === 'number') durations.push(m.duration);
  }

  function variance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  if (intervals.length >= 3) {
    const v = variance(intervals);
    if (v < 1) {
      signals.push('typing_constant');
      humanScore -= 15;
    } else {
      signals.push('typing_variable');
      humanScore += 10;
    }
  }
  if (velocities.length >= 3) {
    const v = variance(velocities);
    if (v < 1) {
      signals.push('scroll_regular');
      humanScore -= 10;
    } else {
      signals.push('scroll_irregular');
      humanScore += 10;
    }
  }
  if (speeds.length >= 3) {
    const v = variance(speeds);
    if (v < 1) {
      signals.push('mouse_uniform');
      humanScore -= 10;
    } else {
      signals.push('mouse_variable');
      humanScore += 10;
    }
  }
  if (durations.length >= 2) {
    const v = variance(durations);
    if (v < 100) {
      signals.push('session_identical');
      humanScore -= 15;
    } else {
      signals.push('session_random');
      humanScore += 10;
    }
  }

  const score = Math.max(0, Math.min(100, humanScore));
  return { score, signals, sampleCount: events.length };
}

/**
 * Get human-likeness score for a user (for use in risk/trust). Returns 50 if insufficient data.
 */
async function getBehaviorBiometricScore(userId) {
  const result = await analyzeBehaviorMetrics(userId);
  return result.score;
}

const MAX_BATCH_MOUSE = 2500;
const MAX_BATCH_CLICKS = 500;
const MAX_BATCH_KEYS = 800;

function clampNum(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(lo, Math.min(hi, x));
}

function sanitizeMouseMoves(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out = [];
  for (const m of raw.slice(-MAX_BATCH_MOUSE)) {
    const x = clampNum(m.x, 0, 65535);
    const y = clampNum(m.y, 0, 65535);
    const t = clampNum(m.t, now - 24 * 60 * 60 * 1000, now + 60_000);
    if (x == null || y == null || t == null) continue;
    out.push({ x: Math.round(x), y: Math.round(y), t: Math.round(t) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function sanitizeClicks(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out = [];
  for (const c of raw.slice(-MAX_BATCH_CLICKS)) {
    const x = clampNum(c.x, 0, 65535);
    const y = clampNum(c.y, 0, 65535);
    const t = clampNum(c.t, now - 24 * 60 * 60 * 1000, now + 60_000);
    if (x == null || y == null || t == null) continue;
    out.push({ x: Math.round(x), y: Math.round(y), t: Math.round(t) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Timings only — reject payloads that include key content. */
function sanitizeKeystrokes(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const out = [];
  for (const k of raw.slice(-MAX_BATCH_KEYS)) {
    if (k && typeof k === 'object' && ('key' in k || 'code' in k)) continue;
    const t = clampNum(k?.t, now - 24 * 60 * 60 * 1000, now + 60_000);
    if (t == null) continue;
    out.push({ t: Math.round(t) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Ingest batched client SDK payloads → BehaviorEvent rows (mouse_move, click, typing_latency).
 * @param {string|null} userId
 * @param {{ mouseMoves?: unknown[], clicks?: unknown[], keystrokes?: unknown[] }} body
 * @returns {Promise<{ inserted: number, behaviorRisk?: object|null }>}
 */
async function ingestBatchedBehavior(userId, body = {}) {
  const uid = userId ? (userId.toString?.() || userId) : null;
  const mouse = sanitizeMouseMoves(body.mouseMoves);
  const clicks = sanitizeClicks(body.clicks);
  const keys = sanitizeKeystrokes(body.keystrokes);
  const docs = [];

  let prev = null;
  for (const m of mouse) {
    const meta = { x: m.x, y: m.y };
    if (prev && m.t >= prev.t) {
      const dt = Math.max(1, m.t - prev.t);
      const dist = Math.hypot(m.x - prev.x, m.y - prev.y);
      meta.speed = Math.round(Math.min(999999, (dist / dt) * 1000));
    }
    docs.push({
      userId: uid,
      eventType: 'mouse_move',
      metadata: meta,
      timestamp: new Date(m.t),
    });
    prev = m;
  }

  for (const c of clicks) {
    docs.push({
      userId: uid,
      eventType: 'click',
      metadata: { x: c.x, y: c.y },
      timestamp: new Date(c.t),
    });
  }

  for (let i = 1; i < keys.length; i++) {
    const interval = keys[i].t - keys[i - 1].t;
    if (interval > 0 && interval < 60000) {
      docs.push({
        userId: uid,
        eventType: 'typing_latency',
        metadata: { interval },
        timestamp: new Date(keys[i].t),
      });
    }
  }

  if (!docs.length) return { inserted: 0, behaviorRisk: null };

  try {
    await db.BehaviorEvent.insertMany(docs, { ordered: false });
  } catch (e) {
    if (e?.name !== 'BulkWriteError') throw e;
  }

  let behaviorRisk = null;
  try {
    const { evaluateBehaviorBatch } = require('./behaviorEnforcement.service');
    behaviorRisk = await evaluateBehaviorBatch(uid, {
      mouseMoves: mouse,
      clicks,
      keystrokes: keys,
    });
  } catch (_) {
    /* optional */
  }

  try {
    await db.Behavior.create({
      userId: uid || null,
      deviceId: body.deviceId != null ? String(body.deviceId).slice(0, 256) : undefined,
      mouseMoves: mouse.map((m) => ({ x: m.x, y: m.y, t: m.t })),
      clicks: clicks.map((c) => ({ x: c.x, y: c.y, t: c.t })),
      keystrokes: keys.map((k) => ({ t: k.t })),
      source: body.source != null ? String(body.source).slice(0, 64) : 'batch_ingest',
    });
  } catch (_) {
    /* snapshot is optional; event rows are primary */
  }

  return { inserted: docs.length, behaviorRisk };
}

module.exports = {
  trackBehavior,
  analyzeBehaviorMetrics,
  getBehaviorBiometricScore,
  ingestBatchedBehavior,
  ALLOWED_EVENT_TYPES,
  normalizePayload,
};
