/**
 * BehaviorEvent — Behavioral AI detection. Human vs bot signals (scroll, pause, typing, clicks).
 * Used for anti-bot and anomaly detection. https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    eventType: { type: String, required: true, index: true },
    metadata:  { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
    sessionId: { type: String, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, timestamp: -1 });
schema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('BehaviorEvent', schema);
