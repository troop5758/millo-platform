/**
 * LiveTicket — paid access to live streams. Ticket offering configuration.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:     { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    creatorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ticketPrice:  { type: Number, default: 0 },   // cents
    maxViewers:   { type: Number, default: null },  // null = unlimited
    startTime:    { type: Date, default: null, index: true },
    status:       { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled', index: true },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, startTime: -1 });
schema.index({ streamId: 1 }, { unique: true });

module.exports = mongoose.model('LiveTicket', schema);
