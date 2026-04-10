'use strict';
/**
 * Milla moderation wrapper — moderates chat, comments, and livestream text.
 * Delegates to AI moderation service; returns a unified shape for all channels.
 * https://milloapp.com
 */
const aiModeration = require('./aiModeration.service');

/**
 * Run moderation on text and return a unified result.
 * @param {string} text - Raw text to moderate
 * @returns {Promise<{ allowed: boolean, decision: string, flagged: boolean, confidence: number, categories: Array, source?: string }>}
 */
async function moderateText(text) {
  const input = text != null ? String(text).trim() : '';
  if (!input) {
    return { allowed: true, decision: 'allow', flagged: false, confidence: 0, categories: [] };
  }

  try {
    const result = await aiModeration.moderateUpload({ text: input });
    const decision = result.decision?.decision ?? 'allow';
    const confidence = Number(result.decision?.confidence) || 0;
    const categories = result.decision?.categories ?? [];
    const allowed = decision !== 'block';
    const flagged = decision === 'block' || decision === 'review';

    return {
      allowed,
      decision,
      flagged,
      confidence,
      categories,
      source: result.providers?.[0],
      queued: result.queued === true,
    };
  } catch (e) {
    if (e.message === 'AI_MODERATION_DISABLED') {
      return { allowed: true, decision: 'allow', flagged: false, confidence: 0, categories: [], source: 'none' };
    }
    throw e;
  }
}

/**
 * Moderate chat message (DM or room chat).
 * @param {string} text
 */
async function moderateChat(text) {
  return moderateText(text);
}

/**
 * Moderate comment text.
 * @param {string} text
 */
async function moderateComment(text) {
  return moderateText(text);
}

/**
 * Moderate livestream chat / on-screen text.
 * @param {string} text
 */
async function moderateLivestreamText(text) {
  return moderateText(text);
}

function isEnabled() {
  return aiModeration.isEnabled();
}

module.exports = {
  moderateText,
  moderateChat,
  moderateComment,
  moderateLivestreamText,
  isEnabled,
};
