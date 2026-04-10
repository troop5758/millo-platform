'use strict';
/**
 * Voice routes — TTS (text-to-speech). Off by default; enable with VOICE_TTS_ENABLED.
 * https://milloapp.com
 */
const tts = require('../services/tts.service');
const milla = require('@millo/milla');

async function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

async function voiceRoutes(app) {
  app.get('/voice/tts/status', async (_request, reply) => {
    return reply.send({ enabled: tts.isTtsEnabled() });
  });

  app.post('/voice/tts', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { text, voice, model, response_format, speed } = request.body ?? {};
    if (!text?.trim()) return reply.status(400).send({ error: 'TEXT_REQUIRED' });

    try {
      const buffer = await tts.generateSpeech(text.trim(), {
        voice,
        model,
        response_format,
        speed,
      });
      return reply
        .header('Content-Type', 'audio/mpeg')
        .send(buffer);
    } catch (e) {
      if (e.message === 'VOICE_TTS_DISABLED') {
        return reply.status(503).send({ error: 'VOICE_TTS_DISABLED', message: 'TTS is not enabled.' });
      }
      if (e.message === 'TEXT_REQUIRED') {
        return reply.status(400).send({ error: e.message });
      }
      request.log.warn({ err: e }, 'TTS error');
      return reply.status(502).send({ error: 'TTS_ERROR', message: e.message });
    }
  });

  /* ── Voice assistant: AI text reply + optional synthesized voice ── */
  app.post('/voice/assistant', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { message, systemPrompt, streamId, model, speak = true, voice, response_format, speed } = request.body ?? {};
    if (!message?.trim()) return reply.status(400).send({ error: 'MESSAGE_REQUIRED' });

    try {
      const aiReply = await milla.generateReply(message.trim(), { systemPrompt, streamId, model });
      let audioBase64 = null;
      let audioFormat = (response_format || 'mp3').toLowerCase();
      if (speak === true && tts.isTtsEnabled()) {
        const audio = await tts.generateSpeech(aiReply.content || '', { voice, model, response_format, speed });
        audioBase64 = audio.toString('base64');
      }
      return reply.send({
        ok: true,
        reply: aiReply,
        audio: audioBase64,
        audioFormat,
        ttsEnabled: tts.isTtsEnabled(),
      });
    } catch (e) {
      if (e.message === 'MILLA_DISABLED') {
        return reply.status(503).send({ error: 'MILLA_DISABLED', message: 'Voice assistant AI is not enabled.' });
      }
      if (e.message === 'OPENAI_API_KEY_REQUIRED') {
        return reply.status(503).send({ error: 'OPENAI_API_KEY_REQUIRED', message: 'AI is not configured.' });
      }
      if (e.message === 'VOICE_TTS_DISABLED') {
        return reply.status(503).send({ error: 'VOICE_TTS_DISABLED', message: 'TTS is not enabled.' });
      }
      request.log.warn({ err: e, userId: String(user._id) }, 'Voice assistant error');
      return reply.status(502).send({ error: 'VOICE_ASSISTANT_ERROR', message: e.message });
    }
  });
}

module.exports = { voiceRoutes };
