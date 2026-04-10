/**
 * EventAttendance — MongoDB schema. RSVP / ticket tracking for live events.
 * Tracks users who attend (free RSVP or paid ticket).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ticketPaid: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ eventId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('EventAttendance', schema);
