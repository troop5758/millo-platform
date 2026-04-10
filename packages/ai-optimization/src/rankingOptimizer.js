/**
 * Ranking optimizer — advisory suggestRanking + getRankingScoreBump for discovery injection.
 * https://milloapp.com
 */
const config = require('./config');
const { logShadowOutput } = require('./shadowLog');

/**
 * Increment added to discovery `_score` when injection is on:
 * uses explicit `item.aiScore` (0–1) when set, else a deterministic heuristic from baseScore/level.
 */
function getRankingScoreBump(item, options = {}) {
  if (!item || typeof item !== 'object') return 0;
  if (!config.shouldApplyRankingInjection()) return 0;

  const w = config.getAiRankScoreWeight();
  const explicit = Number(item.aiScore);
  if (Number.isFinite(explicit) && explicit >= 0) {
    return Math.min(1, explicit) * w;
  }

  const levelWeight = options.levelWeight ?? 0.5;
  const raw = (Number(item.baseScore) || 0) + levelWeight * (Number(item.level) || 0);
  const heuristic = 1 / (1 + Math.exp(-raw / 25));
  return heuristic * w;
}

/**
 * Returns a suggested order and explanation. Does NOT call discovery.rank or modify discovery.
 * Same inputs → same suggestion (deterministic). When kill-switch off, returns disabled.
 */
function suggestRanking(items, options = {}) {
  if (!config.getAiOptimizationEnabled()) {
    return {
      applied: false,
      shadowMode: true,
      disabled: true,
      suggestedOrder: [],
      explanation: { reason: 'AI_OPTIMIZATION_DISABLED', message: 'Kill-switch off; no suggestion applied.' },
    };
  }
  if (!items || items.length === 0) {
    return {
      applied: false,
      shadowMode: true,
      suggestedOrder: [],
      explanation: { reason: 'EMPTY_INPUT', message: 'No items to rank.' },
    };
  }
  const filtered = (options.respectShadowBan !== false)
    ? items.filter((i) => !i.shadowBanned)
    : [...items];
  const levelWeight = options.levelWeight ?? 0.5;
  const defaultBase = 0;
  const withScore = filtered.map((item) => ({
    item,
    score: (item.baseScore ?? defaultBase) + levelWeight * (Number(item.level) || 0),
  }));
  withScore.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d;
    return String(a.item.id || a.item._id || '').localeCompare(String(b.item.id || b.item._id || ''));
  });
  const suggestedOrder = withScore.map((x) => x.item);
  const explanation = {
    reason: 'AI_RANKING_SUGGESTION',
    shadowMode: true,
    applied: false,
    itemCount: suggestedOrder.length,
    factors: ['baseScore', 'level', 'levelWeight'],
    levelWeight,
    message: 'Suggestion only; not applied to discovery.',
  };
  const result = { applied: false, shadowMode: true, suggestedOrder, explanation };
  logShadowOutput('ranking', { applied: false, shadowMode: true, itemCount: suggestedOrder.length, explanation });
  return result;
}

module.exports = { suggestRanking, getRankingScoreBump };
