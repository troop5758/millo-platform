'use strict';
/**
 * Stream session service — Janus REST: create session + attach VideoRoom handle.
 * Thin facade over {@link ./live/janusService} (fetch, apisecret, keepalive, dev stubs).
 *
 * Env: `JANUS_GATEWAY_URL` or `JANUS_URL` — base including path, e.g. http://janus:8088/janus
 * https://milloapp.com
 */

const janusService = require('./live/janusService');

/**
 * @returns {Promise<string>} Janus session id
 */
async function createSession() {
  const { sessionId } = await janusService.createSession();
  return sessionId;
}

/**
 * Attach `janus.plugin.videoroom` to an existing session.
 * @param {string} sessionId
 * @returns {Promise<string>} Plugin handle id
 */
async function attachPlugin(sessionId) {
  const { handleId } = await janusService.attachVideoRoom(sessionId);
  return handleId;
}

module.exports = {
  createSession,
  attachPlugin,
};
