'use strict';
/**
 * Voice command parser — maps natural language to Milla voice intents.
 * Examples: "ban user", "start stream", "add moderator".
 * https://milloapp.com
 */

const INTENTS = {
  BAN_USER: 'ban_user',
  START_STREAM: 'start_stream',
  ADD_MODERATOR: 'add_moderator',
  UNKNOWN: 'unknown',
};

const PATTERNS = [
  { intent: INTENTS.BAN_USER, patterns: [/ban\s+(?:user|them|him|her|this\s+user)/i, /(?:kick|remove)\s+user/i, /ban\s+(\w+)/i] },
  { intent: INTENTS.START_STREAM, patterns: [/start\s+(?:stream|live|broadcast)/i, /go\s+live/i, /begin\s+stream/i] },
  { intent: INTENTS.ADD_MODERATOR, patterns: [/add\s+moderator/i, /make\s+(?:them|him|her)\s+mod/i, /assign\s+mod/i] },
];

/**
 * Parse a voice command string into intent and params.
 * @param {string} input - Raw command (e.g. "ban user", "start stream")
 * @returns {{ intent: string, params: object }}
 */
function parse(input) {
  const text = (input || '').toString().trim();
  if (!text) return { intent: INTENTS.UNKNOWN, params: {} };

  const lower = text.toLowerCase();
  for (const { intent, patterns } of PATTERNS) {
    for (const re of patterns) {
      const match = text.match(re);
      if (match) {
        const params = {};
        if (intent === INTENTS.BAN_USER && match[1]) params.username = match[1].trim();
        return { intent, params };
      }
    }
  }

  return { intent: INTENTS.UNKNOWN, params: {} };
}

module.exports = { parse, INTENTS };
