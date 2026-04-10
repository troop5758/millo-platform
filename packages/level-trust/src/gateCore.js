const { TRUST_TIERS } = require('./constants');

/**
 * Tier order index for comparison (higher index = higher tier).
 */
function tierOrder(tierName) {
  const i = TRUST_TIERS.findIndex((t) => t.name === tierName);
  return i >= 0 ? i : -1;
}

/**
 * Gating logic (pure, no DB). Used by gate.js and tests.
 * https://milloapp.com
 */
function createGate(getLevel, getTrust, getTrustTier) {
  const getTier = getTrustTier || (async (userId) => {
    const trust = await getTrust(userId);
    const { trustTierForScore } = require('./constants');
    return trustTierForScore(trust);
  });

  async function checkLevel(userId, minLevel) {
    const { level } = await getLevel(userId);
    return level >= minLevel;
  }
  async function checkTrust(userId, minTrust) {
    const trust = await getTrust(userId);
    return trust >= minTrust;
  }
  async function checkTrustTier(userId, minTierName) {
    const { name } = await getTier(userId);
    return tierOrder(name) >= tierOrder(minTierName);
  }
  async function requireLevel(userId, minLevel) {
    const ok = await checkLevel(userId, minLevel);
    if (!ok) throw new Error('LEVEL_GATE_FAILED');
    return true;
  }
  async function requireTrust(userId, minTrust) {
    const ok = await checkTrust(userId, minTrust);
    if (!ok) throw new Error('TRUST_GATE_FAILED');
    return true;
  }
  async function requireTrustTier(userId, minTierName) {
    const ok = await checkTrustTier(userId, minTierName);
    if (!ok) throw new Error('TRUST_TIER_GATE_FAILED');
    return true;
  }
  return { checkLevel, checkTrust, checkTrustTier, requireLevel, requireTrust, requireTrustTier };
}

module.exports = { createGate, tierOrder };
