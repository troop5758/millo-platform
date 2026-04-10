'use strict';
/**
 * Chat word filter — Redis-backed banned words. Used by live chat and events.
 * Key: chat:banned (SET). https://milloapp.com
 */
const REDIS_KEY = 'chat:banned';
let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
    const conn = process.env.REDIS_URL || { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
    _redis = typeof conn === 'string' ? new Redis(conn) : new Redis(conn);
    _redis.on('error', () => {});
  } catch {
    _redis = null;
  }
  return _redis;
}

/** In-memory cache of banned words (refreshed when empty or after TTL). */
let _cachedWords = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

async function getBannedWords() {
  if (_cachedWords && Date.now() < _cacheExpiry) return _cachedWords;
  const redis = getRedis();
  if (!redis) return [];
  try {
    const words = await redis.smembers(REDIS_KEY);
    _cachedWords = Array.isArray(words) ? words.filter((w) => typeof w === 'string' && w.length > 0) : [];
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return _cachedWords;
  } catch {
    return _cachedWords || [];
  }
}

/**
 * Check if text passes the chat filter (no banned words). Case-insensitive substring match.
 * @param {string} text - User message
 * @returns {Promise<boolean>} - true if allowed, false if contains banned word
 */
async function filterChat(text) {
  if (!text || typeof text !== 'string') return false;
  const bannedWords = await getBannedWords();
  if (bannedWords.length === 0) return true;
  const lower = text.toLowerCase();
  for (const word of bannedWords) {
    if (word && lower.includes(word.toLowerCase())) return false;
  }
  return true;
}

/**
 * Synchronous check using cached banned words (may be slightly stale).
 * Use when Redis round-trip is not acceptable; prefer filterChat() for consistency.
 */
function filterChatSync(text, bannedWords) {
  if (!text || typeof text !== 'string') return false;
  const words = bannedWords != null ? bannedWords : _cachedWords;
  if (!words || words.length === 0) return true;
  const lower = text.toLowerCase();
  for (const word of words) {
    if (word && lower.includes(String(word).toLowerCase())) return false;
  }
  return true;
}

/** Invalidate cache (e.g. after admin adds/removes banned word). */
function invalidateCache() {
  _cachedWords = null;
  _cacheExpiry = 0;
}

/** Add a banned word (admin). */
async function addBannedWord(word) {
  const redis = getRedis();
  if (!redis) return false;
  const w = String(word).trim().toLowerCase();
  if (!w) return false;
  await redis.sadd(REDIS_KEY, w);
  invalidateCache();
  return true;
}

/** Remove a banned word (admin). */
async function removeBannedWord(word) {
  const redis = getRedis();
  if (!redis) return false;
  await redis.srem(REDIS_KEY, String(word).trim().toLowerCase());
  invalidateCache();
  return true;
}

module.exports = {
  filterChat,
  filterChatSync,
  getBannedWords,
  addBannedWord,
  removeBannedWord,
  invalidateCache,
  REDIS_KEY,
};
