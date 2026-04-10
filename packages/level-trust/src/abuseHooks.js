/**
 * Abuse penalty hooks — register handlers invoked when abuse is applied. Audit logged.
 * https://milloapp.com
 * Phase 3: no live streaming or commerce logic.
 */
const db = require('@millo/database');
const scoring = require('./scoring');

const DEFAULT_ABUSE_TRUST_PENALTY = -10;

const hooks = [];

/**
 * Register a hook (async (userId, reason) => {}). Runs after default trust penalty and audit.
 * @param {(userId: string, reason: string) => Promise<void>} fn
 */
function registerAbusePenaltyHook(fn) {
  if (typeof fn === 'function') hooks.push(fn);
}

/**
 * Apply abuse penalty: default trust deduction + audit log + all registered hooks.
 * @param {string} userId - ObjectId string
 * @param {string} reason - e.g. 'spam', 'report_upheld'
 * @returns {{ applied: boolean }}
 */
async function applyAbusePenalty(userId, reason = 'abuse') {
  await scoring.addTrust(userId, DEFAULT_ABUSE_TRUST_PENALTY, 'abuse_penalty');
  await db.AuditLog.create({
    action: 'trust.abuse_penalty',
    actorId: userId,
    resourceType: 'User',
    resourceId: userId,
    meta: { reason, trustPenalty: DEFAULT_ABUSE_TRUST_PENALTY },
  });
  for (const fn of hooks) {
    await Promise.resolve(fn(userId, reason));
  }
  return { applied: true };
}

module.exports = { registerAbusePenaltyHook, applyAbusePenalty, DEFAULT_ABUSE_TRUST_PENALTY };
