/**
 * FeedEvent — impression and interaction stream for training / bandits (TikTok-style pipeline).
 * Append-heavy; TTL or archival policy recommended in ops.
 * `ts` = event time; `createdAt` / `updatedAt` from Mongoose when `timestamps: true`.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const EVENT_TYPES = [
  'impression',
  'play',
  'watch_2s',
  'watch_6s',
  'watch_15s',
  'complete',
  'like',
  'comment',
  'share',
  'follow_creator',
  'gift',
  'purchase',
  'skip_fast',
  'not_interested',
  'report',
];

const schema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    contentId: { type: String, required: true, index: true },
    sessionId: { type: String, index: true, default: null },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    watchTimeMs: { type: Number, default: 0 },
    position: { type: Number, default: 0 },
    source: { type: String, default: 'for_you' },
    topic: { type: String, default: null },
    contentType: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ts: { type: Date, default: Date.now, index: true },
  },
  { _id: true, timestamps: true }
);

schema.index({ userId: 1, ts: -1 });
schema.index({ contentId: 1, ts: -1 });
schema.index({ eventType: 1, ts: -1 });

module.exports = mongoose.model('FeedEvent', schema);
module.exports.FEED_EVENT_TYPES = EVENT_TYPES;
