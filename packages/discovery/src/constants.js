/**
 * Discovery constants. https://milloapp.com
 * Level and trust weighting: score = baseScore + levelWeight*level + trustWeight*trust + engagementWeight*engagement.
 */
const LEVEL_WEIGHT = 1.0;
const TRUST_WEIGHT = 0.5;
const ENGAGEMENT_WEIGHT = 0.3;
const DEFAULT_BASE_SCORE = 0;

module.exports = { LEVEL_WEIGHT, TRUST_WEIGHT, ENGAGEMENT_WEIGHT, DEFAULT_BASE_SCORE };
