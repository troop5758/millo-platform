/**
 * Discovery Engine — Shorts/Live ranking, level + trust weighting, shadow-ban, explainability.
 * Phase 7: discoveryService, rankingEngine, feedGenerator.
 * https://milloapp.com
 */
const ranking = require('./ranking');
const explainability = require('./explainability');
const rankingEngine = require('./rankingEngine');
const engagementScore = require('./engagementScore');
const feedGenerator = require('./feedGenerator');
const discoveryService = require('./discoveryService');
const fanSegmentation = require('./fanSegmentation');
const candidateGenerator = require('./candidateGenerator');
const policyFilter = require('./policyFilter');
const featureBuilder = require('./featureBuilder');
const heuristicRanker = require('./ranker');
const { DEFAULT_FEED_RANK_WEIGHTS, mergeFeedRankWeights } = heuristicRanker;
const postRanker = require('./postRanker');
const sessionContext = require('./sessionContext');
const coldStart = require('./coldStart');
const exploration = require('./exploration');
const businessRules = require('./businessRules');
const feedService = require('./feed.service');
const multiObjectiveRanker = require('./multiObjectiveRanker');
const { LEVEL_WEIGHT, TRUST_WEIGHT, ENGAGEMENT_WEIGHT, DEFAULT_BASE_SCORE } = require('./constants');

module.exports = {
  ...ranking,
  ...rankingEngine,
  ...engagementScore,
  ...explainability,
  feedGenerator,
  discoveryService,
  fanSegmentation,
  candidateGenerator,
  policyFilter,
  featureBuilder,
  heuristicRanker,
  DEFAULT_FEED_RANK_WEIGHTS,
  mergeFeedRankWeights,
  postRanker,
  sessionContext,
  coldStart,
  exploration,
  businessRules,
  feedService,
  multiObjectiveRanker,
  computeFinalFeedScore: multiObjectiveRanker.computeFinalFeedScore,
  MULTI_OBJECTIVE_WEIGHTS: multiObjectiveRanker.MULTI_OBJECTIVE_WEIGHTS,
  constants: { LEVEL_WEIGHT, TRUST_WEIGHT, ENGAGEMENT_WEIGHT, DEFAULT_BASE_SCORE },
};
