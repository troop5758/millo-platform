/**
 * Level & Trust constants. https://milloapp.com
 */
const XP_PER_LEVEL = 100;

/** Trust tiers: ascending minScore. Used for getTrustTier and tier-based gating. */
const TRUST_TIERS = Object.freeze([
  { name: 'new', minScore: 0 },
  { name: 'member', minScore: 50 },
  { name: 'trusted', minScore: 200 },
  { name: 'veteran', minScore: 500 },
]);

function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  return XP_PER_LEVEL * (level - 1);
}

/**
 * Resolve tier name from trust score (pure).
 * @param {number} score
 * @returns {{ name: string, minScore: number, nextTierAt: number | null }}
 */
function trustTierForScore(score) {
  const s = Math.max(0, score);
  let tier = TRUST_TIERS[0];
  for (let i = TRUST_TIERS.length - 1; i >= 0; i--) {
    if (s >= TRUST_TIERS[i].minScore) {
      tier = TRUST_TIERS[i];
      break;
    }
  }
  const next = TRUST_TIERS.find((t) => t.minScore > tier.minScore);
  return {
    name: tier.name,
    minScore: tier.minScore,
    nextTierAt: next ? next.minScore : null,
  };
}

module.exports = { XP_PER_LEVEL, xpRequiredForLevel, TRUST_TIERS, trustTierForScore };
