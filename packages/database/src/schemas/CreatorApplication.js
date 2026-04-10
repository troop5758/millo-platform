/**
 * CreatorApplication — tracks creator onboarding/verification requests.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    status:        { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    displayName:   { type: String },
    bio:           { type: String, default: '', maxlength: 2000 },
    category:      { type: String, default: 'general' },
    socialLinks:   { type: mongoose.Schema.Types.Mixed, default: {} },
    sampleContent: [{ type: String }],    // URLs to sample content
    idVerified:    { type: Boolean, default: false },
    reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote:    { type: String, default: '' },
    reviewedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CreatorApplication', schema);
