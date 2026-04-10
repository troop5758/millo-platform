/**
 * MusicTrack — Music catalog collection. Royalty-free library; streamed via Audio CDN.
 * Schema: trackId, title, artist, duration, genre, bpm, mood, licenseType, provider, audioUrl, waveform.
 * Indexes: genre, mood, bpm, duration for fast discovery.
 * https://milloapp.com
 */
const mongoose = require('mongoose');
const crypto = require('crypto');

const schema = new mongoose.Schema(
  {
    trackId:        { type: String, unique: true, sparse: true, trim: true },
    title:          { type: String, required: true, trim: true },
    artist:         { type: String, default: '', trim: true },
    duration:       { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    streamUrl:      { type: String, default: null },
    audioUrl:       { type: String, default: null },
    thumbnailUrl:   { type: String, default: null },
    licenseId:      { type: mongoose.Schema.Types.ObjectId, ref: 'MusicLicense', index: true },
    licenseType:    { type: String, default: 'royalty_free', trim: true },
    provider:       { type: String, default: '', trim: true },
    fingerprint:    { type: String, default: null, index: true },
    genre:          { type: String, default: '', trim: true },
    mood:           { type: String, default: '', trim: true },
    bpm:            { type: Number, default: null },
    waveform:       { type: String, default: null },
    tags:           [{ type: String, trim: true }],
    status:         { type: String, enum: ['draft', 'pending_review', 'active', 'disabled', 'rejected'], default: 'active', index: true },
    uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    revSharePercent: { type: Number, default: null },   // artist rev share when song trends (from MusicArtist if null)
    moderatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt:    { type: Date, default: null },
    moderationNote: { type: String, default: '' },
    seedPriority:   { type: Boolean, default: false, index: true },
    seedPriorityReason: { type: String, default: '', trim: true },
    seedPrioritySetAt:   { type: Date, default: null },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ genre: 1 });
schema.index({ mood: 1 });
schema.index({ bpm: 1 });
schema.index({ duration: 1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ title: 'text', artist: 'text', tags: 'text', genre: 'text' });

function generateTrackId() {
  const n = crypto.randomBytes(4).readUInt32BE(0) % 90000 + 10000;
  return `trk_${n}`;
}

schema.pre('save', function (next) {
  if (!this.trackId) this.trackId = generateTrackId();
  if (this.durationSeconds != null && this.duration === 0) this.duration = this.durationSeconds;
  if (this.duration != null && this.durationSeconds === 0) this.durationSeconds = this.duration;
  if (this.audioUrl && !this.streamUrl) this.streamUrl = this.audioUrl;
  if (this.streamUrl && !this.audioUrl) this.audioUrl = this.streamUrl;
  next();
});

module.exports = mongoose.model('MusicTrack', schema);
