'use strict';
/**
 * AI moderation — text stub (replace with LLM / vendor APIs).
 * Video: `sampleFrames` placeholder for FFmpeg → frame buffers → vision models (NSFW / violence).
 * https://milloapp.com
 */

const BANNED_WORDS = ['hate', 'violence', 'scam'];

/**
 * @param {string} text
 * @returns {Promise<{ flagged: boolean, reason?: string }>}
 */
async function moderateText(text) {
  if (text == null || typeof text !== 'string') {
    return { flagged: false };
  }
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return { flagged: true, reason: 'TOXIC_CONTENT' };
    }
  }
  return { flagged: false };
}

/**
 * Sample video for vision moderation (stub).
 * Production: FFmpeg extract 1 frame every ~2s → buffers or S3 keys → Rekognition / custom CV.
 *
 * @param {import('stream').Readable | Buffer | string} _stream — URL, path, or readable (TBD)
 * @returns {Promise<Buffer[]>} JPEG/PNG frame buffers (empty until wired)
 */
async function sampleFrames(_stream) {
  return [];
}

module.exports = {
  moderateText,
  sampleFrames,
  BANNED_WORDS,
};
