/**
 * VideoSound — Creator sound attribution per video (stream/VOD).
 * Schema: videoId, soundId, creatorId, startTime, duration.
 * Display: 🎵 Sound: Summer Vibes
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    videoId:   { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    soundId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack', required: true, index: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startTime: { type: Number, default: 0 },   // seconds into video where sound starts
    duration:  { type: Number, default: null }, // seconds of sound used; null = full track
  },
  { timestamps: true, _id: true }
);

schema.index({ videoId: 1 }, { unique: true });
schema.index({ soundId: 1 });
schema.index({ soundId: 1, createdAt: -1 });

module.exports = mongoose.model('VideoSound', schema);
