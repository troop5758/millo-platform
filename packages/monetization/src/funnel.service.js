/**
 * Funnel Service — upsell funnels, automatically recommends monetization opportunities.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function getFunnels(creatorId, status = 'active') {
  const query = { creatorId };
  if (status !== 'all') query.isActive = status === 'active';
  return db.UpsellFunnel.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

/** Get upsell recommendations for a trigger event (e.g. stream_end, content_view, live_join). */
async function getUpsellRecommendations(creatorId, triggerEvent) {
  if (!creatorId || !triggerEvent) return [];
  return db.UpsellFunnel.find({
    creatorId,
    triggerEvent,
    isActive: true,
  }).sort({ sortOrder: 1 }).lean();
}

/**
 * Trigger upsell — find funnels matching an event. Use when user performs an action (e.g. buys PPV → suggest subscription).
 * @param {Object} event - { event_type, creator_id } or { eventType, creatorId }
 * @returns {Promise<Array>} Matching upsell funnels
 */
async function triggerUpsell(event) {
  const eventType = event?.event_type ?? event?.eventType;
  const creatorId = event?.creator_id ?? event?.creatorId;
  if (!eventType || !creatorId) return [];
  return db.UpsellFunnel.find({
    triggerEvent: eventType,
    creatorId,
    isActive: true,
  }).sort({ sortOrder: 1 }).lean();
}

async function getFunnelSteps(funnelId) {
  const funnel = await db.UpsellFunnel.findById(funnelId).lean();
  return funnel ? [funnel] : [];
}

async function createUpsellFunnel(creatorId, opts) {
  const { triggerEvent, upsellType, targetContentId, price, sortOrder } = opts || {};
  if (!triggerEvent || !upsellType) throw new Error('TRIGGER_AND_TYPE_REQUIRED');
  const funnel = await db.UpsellFunnel.create({
    creatorId,
    triggerEvent,
    upsellType,
    targetContentId: targetContentId || null,
    price: price ?? 0,
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  return funnel.toObject();
}

async function recordFunnelStep(userId, funnelId, stepIndex, meta = {}) {
  return db.AuditLog?.create?.({
    action: 'funnel_step',
    actorId: userId,
    resourceType: 'UpsellFunnel',
    resourceId: funnelId ? String(funnelId) : null,
    meta: { stepIndex, ...meta },
  }).catch(() => null);
}

module.exports = {
  getFunnels,
  getFunnelSteps,
  getUpsellRecommendations,
  triggerUpsell,
  createUpsellFunnel,
  recordFunnelStep,
};
