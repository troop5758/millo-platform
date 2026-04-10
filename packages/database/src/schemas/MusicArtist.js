/**
 * MusicArtist — Creator Music Upload Program. Artist signup, license agreement, rev share.
 * Flow: artist signup → upload track → license agreement → moderation → publish to catalog.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:                    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    status:                    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    revSharePercent:           { type: Number, default: 70 },   // artist share when song trends (platform keeps 100 - revSharePercent)
    licenseAgreementVersion:  { type: String, default: '1' },
    licenseAgreementAcceptedAt: { type: Date, default: null },
    appliedAt:                 { type: Date, default: Date.now },
    approvedBy:                { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:                { type: Date, default: null },
    rejectionReason:           { type: String, default: '' },
    meta:                      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1 });

module.exports = mongoose.model('MusicArtist', schema);
