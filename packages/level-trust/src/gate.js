/**
 * Gating — enforce minimum level and trust. Uses scoring (DB).
 * https://milloapp.com
 */
const scoring = require('./scoring');
const { createGate } = require('./gateCore');

const defaultGate = createGate(
  scoring.getLevel.bind(scoring),
  scoring.getTrust.bind(scoring),
  scoring.getTrustTier && scoring.getTrustTier.bind(scoring)
);

function createGateWithScoring(scoringImpl) {
  const s = scoringImpl || scoring;
  return createGate(
    s.getLevel.bind(s),
    s.getTrust.bind(s),
    s.getTrustTier && s.getTrustTier.bind(s)
  );
}

module.exports = {
  ...defaultGate,
  createGate: createGateWithScoring,
};
