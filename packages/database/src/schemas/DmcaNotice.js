/**
 * DmcaNotice — DMCA takedown notice (17 USC § 512(c)(3)).
 * Stores claimant info, work identification, infringing material, and resolution.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    // Claimant (required under 512(c)(3))
    claimantName:    { type: String, required: true, trim: true },
    claimantEmail:   { type: String, required: true, trim: true },
    claimantAddress: { type: String, default: '', trim: true },
    signature:       { type: String, default: '', trim: true }, // "Electronic signature" or typed name

    // Identification of copyrighted work
    workDescription: { type: String, required: true, trim: true },
    workUrl:         { type: String, default: '' },

    // Identification of infringing material (content on our platform)
    targetType:      { type: String, enum: ['stream', 'event', 'product', 'content'], required: true, index: true },
    targetId:        { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    infringingUrls: [{ type: String }], // Optional list of URLs claimant provided

    // Statements (good faith, accuracy under penalty of perjury)
    goodFaithStatement: { type: String, default: '', trim: true },
    accuracyStatement: { type: String, default: '', trim: true },

    // Processing
    status:          { type: String, enum: ['pending', 'accepted', 'rejected', 'taken_down'], default: 'pending', index: true },
    reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:      { type: Date },
    rejectionReason: { type: String, default: '' },
    takenDownAt:     { type: Date },

    // Content owner (uploader) — resolved from targetId
    contentOwnerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    notifiedAt:      { type: Date }, // When we notified uploader of takedown

    // Counter-notice
    counterNotice:   {
      submittedAt:   { type: Date },
      signerName:    { type: String },
      signerEmail:   { type: String },
      signerAddress: { type: String },
      goodFaithStatement: { type: String },
      consentToJurisdiction: { type: Boolean },
      claimantNotifiedAt: { type: Date },
      restoreAfter:  { type: Date }, // 10–14 business days from counter-notice
      restoredAt:    { type: Date },
      lawsuitFiled:  { type: Boolean, default: false }, // If true, do not restore
    },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ contentOwnerId: 1, status: 1 });

module.exports = mongoose.model('DmcaNotice', schema);
