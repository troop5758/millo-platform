/**
 * Profile — MongoDB schema. https://milloapp.com
 * Fields: userId (ref User, required), displayName, avatarUrl, bio, externalLinks ([{url, label}]), dateOfBirth, meta (mixed). Timestamps.
 * Indexes: userId (unique), displayName.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String },
    avatarUrl: { type: String },
    bio: { type: String },
    externalLinks: [{ url: { type: String, required: true }, label: { type: String } }],
    dateOfBirth:   { type: Date },
    ageVerifiedAt: { type: Date },
    idVerifiedAt:  { type: Date },
    shadowBanned:  { type: Boolean, default: false },
    badges:        [{ badgeId: { type: String, required: true }, label: { type: String }, icon: { type: String } }],
    privacy:       {
      showOnline:     { type: Boolean, default: true },
      showFollowers:  { type: Boolean, default: true },
      showSubscriptions: { type: Boolean, default: true },
      allowDmFrom:     { type: String, enum: ['everyone', 'followers', 'none'], default: 'everyone' },
    },
    /** Creator tier override: starter, growth, pro, enterprise. If unset, tier is computed from subscriber count. */
    creatorTier:   { type: String, enum: ['starter', 'growth', 'pro', 'enterprise'], default: null, index: true },
    /** Set when creator application is approved; used for verified badge. */
    creatorVerifiedAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ displayName: 1 });
schema.index({ shadowBanned: 1 });
schema.index({ displayName: 'text', bio: 'text' }); // full-text search

module.exports = mongoose.model('Profile', schema);
