/**
 * Monetization Event Tracking — record all revenue actions.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * Record a monetization event. Call after successful revenue actions.
 * @param {Object} opts - userId, creatorId, eventType, amount (cents), currency, refType, refId, meta
 */
async function recordMonetizationEvent(opts) {
  const { userId, creatorId, eventType, amount, currency = 'USD', refType, refId, meta = {} } = opts || {};
  if (!userId || !eventType || amount == null) return null;
  const event = await db.MonetizationEvent.create({
    userId,
    creatorId: creatorId || null,
    eventType,
    amount: Number(amount),
    currency: String(currency).toUpperCase() || 'USD',
    refType: refType || null,
    refId: refId ? String(refId) : null,
    meta,
  });
  return event.toObject();
}

module.exports = {
  recordMonetizationEvent,
};
