'use strict';
/**
 * CreatorKyc — Phase 5 KYC verification for creators. Required before payouts.
 * Tracks verification status via Onfido, Persona, Stripe Identity.
 * Fields: creatorId, fullName, country, documentType, documentNumber, verification_status.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName:           { type: String, default: null },
    country:            { type: String, default: null },
    documentType:       { type: String, default: null },
    documentNumber:     { type: String, default: null },
    provider:           { type: String, enum: ['onfido', 'persona', 'stripe_identity', 'sumsub'], default: 'stripe_identity' },
    status:             { type: String, enum: ['pending', 'verified', 'in_review', 'approved', 'rejected'], default: 'pending' },
    applicantId:        { type: String, default: null },         // Onfido/Persona applicant ID
    verificationId:    { type: String, default: null },          // Provider verification/check ID
    governmentIdVerified: { type: Boolean, default: false },
    selfieVerified:     { type: Boolean, default: false },
    addressVerified:   { type: Boolean, default: false },
    taxFormSubmitted:  { type: Boolean, default: false },
    rejectedReason:    { type: String, default: null },
    meta:              { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1 }, { unique: true });
schema.index({ status: 1 });

module.exports = mongoose.model('CreatorKyc', schema);
