'use strict';
/**
 * TTS (Text-to-Speech) service — OpenAI speech synthesis.
 * Off by default; enable with VOICE_TTS_ENABLED=true and OPENAI_API_KEY.
 * https://milloapp.com
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TTS_ENABLED = process.env.VOICE_TTS_ENABLED === 'true' && !!OPENAI_API_KEY;

const DEFAULT_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';
const DEFAULT_FORMAT = 'mp3';

/**
 * Generate speech from text via OpenAI TTS.
 * @param {string} text - Text to synthesize (max 4096 chars)
 * @param {{ model?: string, voice?: string, response_format?: string, speed?: number }} [opts]
 * @returns {Promise<Buffer>} Audio buffer (MP3 by default)
 */
async function generateSpeech(text, opts = {}) {
  if (!TTS_ENABLED) {
    throw new Error('VOICE_TTS_DISABLED');
  }
  const input = String(text || '').trim().slice(0, 4096);
  if (!input) throw new Error('TEXT_REQUIRED');

  const body = {
    model: opts.model || DEFAULT_MODEL,
    input,
    voice: opts.voice || DEFAULT_VOICE,
    response_format: opts.response_format || DEFAULT_FORMAT,
  };
  if (opts.speed != null && opts.speed >= 0.25 && opts.speed <= 4) {
    body.speed = opts.speed;
  }

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OPENAI_TTS_ERROR: ${res.status} ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function isTtsEnabled() {
  return TTS_ENABLED;
}

module.exports = { generateSpeech, isTtsEnabled };
