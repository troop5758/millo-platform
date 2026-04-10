/**
 * ScheduledStream — MongoDB schema. Live stream scheduling.
 * Creators schedule live streams for a future time; system auto-starts at scheduled time.
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
    streamType: {
      type: String,
      enum: ['standard', 'auction', 'paid_event', 'product_launch'],
      default: 'standard',
      index: true,
    },
    priceCents: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    notifyFollowers: { type: Boolean, default: true },
    /** Reminder windows sent: '24h' | '1h' | '15m' — prevents duplicate reminders */
    remindersSent: [{ type: String, enum: ['24h', '1h', '15m'] }],
    /** Scheduled live commerce: products, auctions, PPV tickets to attach when stream goes live */
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    auctionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
    liveStreamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, scheduledStart: -1 });
schema.index({ status: 1, scheduledStart: 1 });

module.exports = mongoose.model('ScheduledStream', schema);
