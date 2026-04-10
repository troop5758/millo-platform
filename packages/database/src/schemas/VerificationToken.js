/**
 * VerificationToken — email, phone, identity verification tokens.
 * Fields: userId, token, type (email|phone|identity), expiresAt.
 * Indexes: token (unique), userId+type, expiresAt (TTL).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token:    { type: String, required: true },
    type:     { type: String, required: true, enum: ['email', 'phone', 'identity', 'risk_lock_otp'] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ token: 1 }, { unique: true });
schema.index({ userId: 1, type: 1 });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('VerificationToken', schema);
