/**
 * LiveDeviceMetrics — device/connection analytics for live streams (bitrate, dropped frames, connection quality, device type).
 * Client sends periodically; used for QoE and debugging. https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:           { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    viewerId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    sessionId:          { type: String },
    deviceType:         { type: String },   // e.g. "mobile", "desktop", "tablet", "tv"
    bitrate:            { type: Number },  // kbps
    droppedFrames:      { type: Number },
    connectionQuality:   { type: String },  // e.g. "excellent", "good", "fair", "poor"
    latency:             { type: Number }, // ms
    fps:                { type: Number },
    resolution:         { type: String },
    meta:               { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, createdAt: -1 });
schema.index({ streamId: 1, viewerId: 1, createdAt: -1 });

module.exports = mongoose.model('LiveDeviceMetrics', schema);
