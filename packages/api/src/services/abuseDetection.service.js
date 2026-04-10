'use strict';
/**
 * Abuse Detection AI — rule-based banned-word check. Fast pre-filter before AI moderation.
 * https://milloapp.com
 */
const DEFAULT_BANNED = ['scam', 'fraud'];
const BANNED = (process.env.ABUSE_BANNED_WORDS || '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);
const WORDS = BANNED.length > 0 ? BANNED : DEFAULT_BANNED;

/**
 * Detect abuse in text (banned words). Case-insensitive.
 * @param {string} text
 * @returns {boolean}
 */
function detectAbuse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return WORDS.some((w) => lower.includes(w));
}

module.exports = { detectAbuse };
