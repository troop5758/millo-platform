/**
 * PpvMessage — announcements/notifications for PPV events (e.g. upcoming, reminder).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:       { type: String, enum: ['announcement', 'reminder', 'live_now', 'custom'], default: 'announcement', index: true },
    title:      { type: String, required: true },
    body:       { type: String, default: '' },
    scheduledAt: { type: Date, default: null },
    sentAt:     { type: Date, default: null },
    targetAudience: { type: String, enum: ['all', 'subscribers', 'followers', 'purchasers'], default: 'all' },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, type: 1 });
schema.index({ creatorId: 1, scheduledAt: 1 });

module.exports = mongoose.model('PpvMessage', schema);
