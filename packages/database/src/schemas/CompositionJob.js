/**
 * CompositionJob — video + audio composition (FFmpeg) job tracking.
 * Fields: video_id, audio_id, trim_start, trim_end, volume, status, outputUrl.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    videoId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    audioId:    { type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack', required: true, index: true },
    trimStart:  { type: Number, default: 0 },   // seconds (music start)
    trimEnd:    { type: Number, default: null }, // seconds (music end; null = full)
    volume:     { type: Number, default: 1 },    // music volume multiplier (0–2)
    status:     { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
    videoUrl:   { type: String },  // resolved at enqueue (for worker)
    audioUrl:   { type: String },  // resolved at enqueue (for worker)
    outputUrl:  { type: String, default: null },
    error:      { type: String, default: null },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CompositionJob', schema);
