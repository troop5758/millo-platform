/**
 * SellerVerification — commerce seller verification. Stages: email → phone → kyc → bank_verification → manual_review.
 * Fields: userId, stage, completedStages, businessName, taxId, documentUrl, idDocumentUrl, selfieUrl, address, bankAccount, status.
 * Commerce Integrity: `sellerStatus` is the canonical sell gate — verified | pending | blocked (workflow `status` remains for review stages).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const STAGE_ENUM = ['email', 'phone', 'kyc', 'bank_verification', 'manual_review'];
const SELLER_STATUS_ENUM = ['pending', 'verified', 'blocked'];

const schema = new mongoose.Schema(
  {
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stage:          { type: String, enum: STAGE_ENUM, default: 'email', index: true },
    completedStages: [{ type: String, enum: STAGE_ENUM }],
    businessName:   { type: String },
    taxId:          { type: String },
    documentUrl:    { type: String },
    idDocumentUrl:  { type: String },
    selfieUrl:      { type: String },
    address:        { type: String },
    bankAccount:    { type: String },
    /** Canonical commerce state for listing/selling; use with `status` for full KYC workflow. */
    sellerStatus:   { type: String, enum: SELLER_STATUS_ENUM, default: 'pending', index: true },
    status:         { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:     { type: Date },
    rejectReason:   { type: String },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 });
schema.index({ status: 1 });
schema.index({ stage: 1, status: 1 });
schema.index({ sellerStatus: 1 });
/** List admin queue: pending review docs that are not platform-blocked. */
schema.index({ status: 1, sellerStatus: 1 });
schema.index({ createdAt: -1 });

schema.pre('save', function sellerStatusSync(next) {
  if (this.sellerStatus === 'blocked') return next();
  if (!this.isModified('status')) return next();
  if (this.isModified('sellerStatus')) return next();
  if (this.status === 'approved') this.sellerStatus = 'verified';
  else this.sellerStatus = 'pending';
  next();
});

schema.statics.STAGE_ENUM = STAGE_ENUM;
schema.statics.SELLER_STATUS_ENUM = SELLER_STATUS_ENUM;
module.exports = mongoose.model('SellerVerification', schema);
