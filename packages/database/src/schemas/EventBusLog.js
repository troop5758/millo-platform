/**
 * EventBusLog — event bus analytics sink. Consumer workers (e.g. analytics) can persist events here.
 * Optional; used when event bus is enabled and analytics consumer runs.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    topic:     { type: String, required: true, index: true },
    eventType:  { type: String, default: 'unknown', index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ topic: 1, createdAt: -1 });
schema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.model('EventBusLog', schema);
