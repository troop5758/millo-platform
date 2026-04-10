'use strict';
/**
 * AI Chat — MILLA generates replies for live stream chat. Off by default (MILLA_ENABLED).
 * https://milloapp.com
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.MILLA_API_KEY;
const MILLA_ENABLED = process.env.MILLA_ENABLED !== 'false';
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Generate an AI reply to a chat message.
 * @param {string} message - User message/prompt
 * @param {{ streamId?: string, systemPrompt?: string, model?: string }} [opts]
 * @returns {Promise<{ role: string, content: string }>}
 */
async function generateReply(message, opts = {}) {
  if (!MILLA_ENABLED) {
    throw new Error('MILLA_DISABLED');
  }
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY_REQUIRED');
  }
  const input = String(message || '').trim().slice(0, 2000);
  if (!input) throw new Error('MESSAGE_REQUIRED');

  const messages = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  messages.push({ role: 'user', content: input });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      max_tokens: 150,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OPENAI_CHAT_ERROR: ${res.status} ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error('OPENAI_NO_REPLY');

  return {
    role: choice.message.role || 'assistant',
    content: choice.message.content || '',
  };
}

module.exports = { generateReply };
