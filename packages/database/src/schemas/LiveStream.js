/**
 * LiveStream — MongoDB schema. https://milloapp.com
 * Fields: userId, status, visibility, streamKey, startedAt, endedAt, title, meta. Timestamps.
 * Indexes: userId+createdAt, status, startedAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
    visibility: { type: String, enum: ['public', 'private', 'paid'], default: 'public' },
    streamKey:      { type: String },
    playbackUrl:    { type: String, default: null },   // HLS .m3u8 URL for viewers
    thumbnailUrl:   { type: String, default: null },   // Stream poster/preview
    recordingUrl:   { type: String, default: null },   // VOD recording URL (post-stream)
    recordingDuration: { type: Number, default: null },// seconds
    viewerCount:    { type: Number, default: 0 },
    peakViewers:    { type: Number, default: 0 },
    totalGiftCoins: { type: Number, default: 0 },
    category:       { type: String, default: 'general' },
    contentCategory:{ type: String, enum: ['safe', 'mature', 'explicit'], default: 'safe', index: true },
    tags:           [{ type: String }],
    priceCents:     { type: Number, default: 0 },      // PPV price
    /** DMCA/policy removal — when set, content is disabled from public access */
    removedAt:      { type: Date, default: null },
    removalReason:  { type: String, default: null },   // e.g. 'dmca', 'policy'
    dmcaNoticeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'DmcaNotice', default: null },
    startedAt: { type: Date },
    endedAt:   { type: Date },
    title:     { type: String },
    language:  { type: String, default: null },  // e.g. "en", "es"
    /** Live shopping: product IDs featured in this stream (Buy Now strip; TikTok-style). */
    featuredProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1 });
schema.index({ startedAt: -1 });
schema.index({ status: 1, startedAt: -1 });
schema.index({ recordingUrl: 1, status: 1 }); // VOD queries
schema.index({ title: 'text', category: 'text', tags: 'text' }); // full-text search

module.exports = mongoose.model('LiveStream', schema);
