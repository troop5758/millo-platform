/**
 * LiveStreamMetrics — device/playback metrics (Phase 4). Client sends every ~5s.
 * Fields: streamId, viewerId?, latency (ms), fps, packetLoss, resolution. Timestamps.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    viewerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    sessionId:    { type: String },
    latency:      { type: Number },   // ms
    fps:          { type: Number },
    packetLoss:   { type: Number },   // 0–1 or percent
    resolution:   { type: String },   // e.g. "1920x1080"
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, createdAt: -1 });
schema.index({ streamId: 1, viewerId: 1, createdAt: -1 });

module.exports = mongoose.model('LiveStreamMetrics', schema);
