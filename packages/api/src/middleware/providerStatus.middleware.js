'use strict';
/**
 * Optional Fastify hook: attaches request.providerStatus (env-only aggregate).
 * NOT registered by default — add in app bootstrap if needed:
 *
 *   const { registerProviderStatusHook } = require('./middleware/providerStatus.middleware');
 *   registerProviderStatusHook(fastify);
 *
 * https://milloapp.com
 */

const { getProviderStatus } = require('../utils/providerStatus');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
function registerProviderStatusHook(fastify) {
  fastify.addHook('onRequest', async (request) => {
    request.providerStatus = getProviderStatus();
  });
}

/**
 * Optional: compact header for debugging only (avoid large payloads on every response).
 * Enable with ATTACH_PROVIDER_STATUS_HEADER=true
 */
function registerProviderStatusHeaderHook(fastify) {
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (process.env.ATTACH_PROVIDER_STATUS_HEADER !== 'true') return payload;
    try {
      const s = request.providerStatus || getProviderStatus();
      const compact = JSON.stringify({
        pay: s.payments?.mode,
        em: s.email,
        pu: s.push?.mode,
      });
      reply.header('X-Millo-Provider-Compact', compact);
    } catch (_) { /* ignore */ }
    return payload;
  });
}

module.exports = {
  registerProviderStatusHook,
  registerProviderStatusHeaderHook,
};
