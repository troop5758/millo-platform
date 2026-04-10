/**
 * LiveEvent — MongoDB schema. Live event scheduling (public, ticketed, auction, product_drop).
 * Comparable to TikTok/YouTube scheduled live events.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, trim: true, maxlength: 200 },
    description: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    scheduledStart: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60 },
    eventType: {
      type: String,
      enum: ['public', 'ticketed', 'auction', 'product_drop'],
      default: 'public',
      index: true,
    },
    ticketPriceCents: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    liveStreamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    replayUrl: { type: String, default: null },
    remindersSent: [{ type: String, enum: ['24h', '1h', '15m'] }],
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, scheduledStart: -1 });
schema.index({ status: 1, scheduledStart: 1 });
schema.index({ creatorId: 1, status: 1, replayUrl: 1 });

module.exports = mongoose.model('LiveEvent', schema);
