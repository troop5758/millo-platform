/**
 * UserSecurity — per-user login risk state (devices, geo history, lockout).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    knownDevices: { type: [String], default: [] },
    lastIps: { type: [String], default: [] },
    lastCountries: { type: [String], default: [] },
    baselineBehavior: { type: mongoose.Schema.Types.Mixed, default: {} },
    mfaEnabled: { type: Boolean, default: false },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true, _id: true }
);

module.exports = mongoose.model('UserSecurity', schema);
