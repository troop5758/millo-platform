'use strict';
/**
 * Kafka-driven discovery ranking — consumes video.view / video.like, updates Redis score.
 * Enable: KAFKA_ENABLED=true && KAFKA_DISCOVERY_RANKING_ENABLED=true
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const { incrementAndScore } = require('../lib/discoveryRankingRedis');

let _consumer = null;

async function handlePayload(payload, topic) {
  const p = payload || {};
  const contentId = p.contentId || p.streamId;
  if (!contentId) return;

  if (topic === kafka.TOPICS.VIDEO_VIEW) {
    let incViews = 1;
    if (p.viewsDelta != null && Number.isFinite(Number(p.viewsDelta))) {
      incViews = Math.max(0, Math.min(100, Number(p.viewsDelta)));
    }
    const watchDelta = Math.max(0, Math.min(6 * 60 * 60, Number(p.watchSeconds ?? p.watchTime ?? 0) || 0));
    await incrementAndScore(String(contentId), {
      views: incViews,
      watchTime: watchDelta,
    });
    return;
  }

  if (topic === kafka.TOPICS.VIDEO_LIKE) {
    const delta = Math.max(-1e6, Math.min(1e6, Number(p.delta ?? 1) || 0));
    if (delta === 0) return;
    await incrementAndScore(String(contentId), { likes: delta });
  }
}

async function start(opts = {}) {
  const log = opts.log || console;
  if (!kafka.isEnabled()) {
    log.info?.('[discoveryKafkaRanking] Kafka disabled, skipping');
    return { consumer: null, run: Promise.resolve() };
  }
  if (process.env.KAFKA_DISCOVERY_RANKING_ENABLED !== 'true') {
    log.info?.('[discoveryKafkaRanking] Set KAFKA_DISCOVERY_RANKING_ENABLED=true to run');
    return { consumer: null, run: Promise.resolve() };
  }

  const groupId = process.env.KAFKA_DISCOVERY_RANKING_GROUP_ID || 'millo-discovery-ranking';
  const { consumer, run } = await kafka.startConsumer(
    groupId,
    [kafka.TOPICS.VIDEO_VIEW, kafka.TOPICS.VIDEO_LIKE],
    (payload, topic) => handlePayload(payload, topic),
    { fromBeginning: false, log },
  );
  _consumer = consumer;
  if (run) run.catch((err) => log.error?.({ err }, '[discoveryKafkaRanking] run error'));
  log.info?.(
    { topics: [kafka.TOPICS.VIDEO_VIEW, kafka.TOPICS.VIDEO_LIKE], groupId },
    '[discoveryKafkaRanking] started',
  );
  return { consumer, run };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch {}
    _consumer = null;
  }
}

module.exports = { start, stop, handlePayload };
