'use strict';
/**
 * Trust graph — user ↔ device links for fraud / trust pipelines.
 * Persists `TrustGraphLink` (user USES device) and dual-writes Neo4j when configured (`trust.service`).
 *
 * Prefer **canonical fingerprint** (server `DeviceFingerprint.fingerprint`) as `deviceId` so hints
 * that map to the same device collapse to one node.
 * https://milloapp.com
 */

const { createEdge, EDGE_TYPE, graph } = require('./trust.service');

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string} deviceId - canonical fingerprint or stable client id (≥8 chars)
 * @param {object} [meta] - optional edge meta (e.g. `{ source: 'device_register' }`)
 * @returns {Promise<{ ok: boolean, id?: import('mongoose').Types.ObjectId, from: object, to: object, edgeType: string }|null>}
 */
async function linkDeviceToUser(userId, deviceId, meta) {
  if (userId == null || deviceId == null) return null;
  const uid = String(userId).trim();
  const did = String(deviceId).trim().slice(0, 256);
  if (!uid || did.length < 8) return null;
  try {
    return await createEdge({
      userId: uid,
      deviceId: did,
      type: EDGE_TYPE.USES,
      meta: meta && typeof meta === 'object' ? meta : undefined,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[trustGraph.service] linkDeviceToUser:', err?.message);
    }
    return null;
  }
}

module.exports = {
  linkDeviceToUser,
  /** TikTok-style alias: same backing as trust.service `graph` */
  graph,
};
