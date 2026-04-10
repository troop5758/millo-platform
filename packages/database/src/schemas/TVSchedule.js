/**
 * TVSchedule — MongoDB schema. https://milloapp.com
 * Fields: channelId (ref TVChannel, required), startsAt (required), endsAt (required), title, refId (ObjectId), meta (mixed). Timestamps.
 * Indexes: channelId+startsAt, startsAt+endsAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'TVChannel', required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    title: { type: String },
    refId: { type: mongoose.Schema.Types.ObjectId },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ channelId: 1, startsAt: 1 });
schema.index({ startsAt: 1, endsAt: 1 });

module.exports = mongoose.model('TVSchedule', schema);
