'use strict';
/**
 * AI routes — Milla AI chat, voice-command hooks.
 *
 * POST /ai/chat              — chat (body: prompt/message, context/systemPrompt, optional userId)
 * POST /ai/milla/voice-command — voice command intent (e.g. "ban user", "start stream", "add moderator")
 * https://milloapp.com
 */
const milla = require('@millo/milla');
const { resolveSession } = require('./auth');
const voiceCommandParser = require('../services/voiceCommandParser');

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function aiRoutes(app) {
  /* ── MILLA AI Chat API: prompt, context, userId ── */
  app.post('/ai/chat', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const body = request.body ?? {};
    const message = (body.prompt ?? body.message) != null ? String(body.prompt ?? body.message).trim() : '';
    const systemPrompt = body.context ?? body.systemPrompt;
    const streamId = body.streamId;
    const model = body.model;
    if (!message) {
      return reply.status(400).send({ error: 'MESSAGE_REQUIRED', message: 'prompt or message required' });
    }

    try {
      const aiReply = await milla.generateReply(message, {
        systemPrompt,
        streamId,
        model,
      });
      const userId = body.userId != null ? String(body.userId) : String(user._id);
      return reply.send({
        ok: true,
        reply: aiReply,
        userId,
      });
    } catch (e) {
      if (e.message === 'MILLA_DISABLED') {
        return reply.status(503).send({ error: 'MILLA_DISABLED', message: 'AI chat is not enabled.' });
      }
      if (e.message === 'OPENAI_API_KEY_REQUIRED') {
        return reply.status(503).send({ error: 'OPENAI_API_KEY_REQUIRED', message: 'AI chat is not configured.' });
      }
      if (e.message === 'MESSAGE_REQUIRED') {
        return reply.status(400).send({ error: 'MESSAGE_REQUIRED' });
      }
      request.log.warn({ err: e, userId: String(user._id) }, 'AI chat error');
      return reply.status(502).send({ error: 'AI_CHAT_ERROR', message: e.message });
    }
  });

  /* ── Milla voice command hooks: "ban user", "start stream", "add moderator" ── */
  app.post('/ai/milla/voice-command', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { command, text } = request.body ?? {};
    const input = (command ?? text ?? '').toString().trim();
    if (!input) return reply.status(400).send({ error: 'COMMAND_REQUIRED', message: 'command or text required' });

    const parsed = voiceCommandParser.parse(input);
    return reply.send({
      ok: true,
      intent: parsed.intent,
      params: parsed.params,
      acknowledged: parsed.intent !== 'unknown',
      raw: input,
    });
  });
}

module.exports = { aiRoutes };
