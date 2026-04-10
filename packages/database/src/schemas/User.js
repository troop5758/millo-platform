/**
 * User — MongoDB schema. https://milloapp.com
 * Fields: email (required), externalId, role (default 'user'), flags (mixed). Timestamps: createdAt, updatedAt.
 * Indexes: email (unique), externalId, role, createdAt.
 * status: explicit states — active | suspended | banned (+ pending_verification). See @millo/shared userAccountStatus.
 */
const mongoose = require('mongoose');
const { USER_STATUS_SCHEMA_ENUM, USER_ACCOUNT_STATUS } = require('@millo/shared').userAccountStatus;

const schema = new mongoose.Schema(
  {
    email:         { type: String, required: true },
    externalId:    { type: String },
    role:          { type: String, enum: ['user', 'creator', 'mod', 'support', 'ops', 'admin'], default: 'user' },
    status:            { type: String, enum: USER_STATUS_SCHEMA_ENUM, default: USER_ACCOUNT_STATUS.ACTIVE, index: true },
    suspensionReason: { type: String },
    /** Admin who created this account (e.g. support accounts). Audit / RBAC. */
    createdBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Optional staff permissions (support role). When absent, support has full ticket access. */
    permissions:       {
      canModerate:     { type: Boolean, default: false },
      canViewTickets:  { type: Boolean, default: false },
      canRespondTickets: { type: Boolean, default: false },
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    creatorStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    shadowBanned:  { type: Boolean, default: false, index: true },
    riskLock:      { type: Boolean, default: false, index: true },
    /**
     * When true, client should not send device fingerprint collectors and API skips optional fingerprint persistence (fraud UX tradeoff).
     */
    optOutFingerprinting: { type: Boolean, default: false, index: true },
    flags:         { type: mongoose.Schema.Types.Mixed, default: {} },
    pushTokens:    [{
      token:     { type: String, required: true },
      platform:  { type: String, enum: ['expo', 'fcm', 'apns'], default: 'expo' },
      updatedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true, _id: true }
);

schema.index({ email: 1 }, { unique: true });
schema.index({ externalId: 1 });
schema.index({ role: 1 });
schema.index({ status: 1 });
schema.index({ createdAt: -1 });

module.exports = mongoose.model('User', schema);
