'use strict';
/**
 * Stream moderation state (Redis). Moderators can mute chat, disable reactions, block gifts.
 * Key: live:mod:{streamId} (HASH) — chat_muted, reactions_disabled, gifts_blocked ("1" | "0").
 * https://milloapp.com
 */
const KEY_PREFIX = 'live:mod:';
const TTL_SECONDS = 24 * 60 * 60; // 24h

const FIELDS = {
  chat_muted: 'chat_muted',
  reactions_disabled: 'reactions_disabled',
  gifts_blocked: 'gifts_blocked',
};

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  try {
    const Redis = require('ioredis');
    const REDIS_URL = process.env.REDIS_URL;
    const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
    _redis = REDIS_URL ? new Redis(REDIS_URL) : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
    _redis.on('error', () => {});
    return _redis;
  } catch {
    return null;
  }
}

function key(streamId) {
  return KEY_PREFIX + String(streamId);
}

/**
 * Get current moderation flags for a stream.
 * @param {string} streamId
 * @returns {Promise<{ chatMuted: boolean, reactionsDisabled: boolean, giftsBlocked: boolean }>}
 */
async function get(streamId) {
  const redis = getRedis();
  if (!redis || !streamId) {
    return { chatMuted: false, reactionsDisabled: false, giftsBlocked: false };
  }
  try {
    const k = key(streamId);
    const raw = await redis.hmget(k, FIELDS.chat_muted, FIELDS.reactions_disabled, FIELDS.gifts_blocked);
    return {
      chatMuted: raw[0] === '1',
      reactionsDisabled: raw[1] === '1',
      giftsBlocked: raw[2] === '1',
    };
  } catch {
    return { chatMuted: false, reactionsDisabled: false, giftsBlocked: false };
  }
}

/**
 * Set one or more moderation flags. Only provided flags are updated.
 * @param {string} streamId
 * @param {{ chatMuted?: boolean, reactionsDisabled?: boolean, giftsBlocked?: boolean }} flags
 * @returns {Promise<{ chatMuted: boolean, reactionsDisabled: boolean, giftsBlocked: boolean }>}
 */
async function set(streamId, flags) {
  const redis = getRedis();
  if (!redis || !streamId) return get(streamId);
  const k = key(streamId);
  const updates = [];
  if (typeof flags.chatMuted === 'boolean') updates.push(FIELDS.chat_muted, flags.chatMuted ? '1' : '0');
  if (typeof flags.reactionsDisabled === 'boolean') updates.push(FIELDS.reactions_disabled, flags.reactionsDisabled ? '1' : '0');
  if (typeof flags.giftsBlocked === 'boolean') updates.push(FIELDS.gifts_blocked, flags.giftsBlocked ? '1' : '0');
  if (updates.length === 0) return get(streamId);
  try {
    await redis.hset(k, ...updates);
    await redis.expire(k, TTL_SECONDS);
    return get(streamId);
  } catch {
    return get(streamId);
  }
}

module.exports = { get, set, KEY_PREFIX, FIELDS };
