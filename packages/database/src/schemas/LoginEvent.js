/**
 * LoginEvent — risk pipeline record per login attempt (success or failure).
 * Decision: ALLOW | STEP_UP | CAPTCHA | BLOCK
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, index: true },
    ip: { type: String },
    country: { type: String },
    userAgent: { type: String },
    success: { type: Boolean, default: false, index: true },
    riskScore: { type: Number },
    decision: { type: String }, // ALLOW | STEP_UP | CAPTCHA | BLOCK
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('LoginEvent', schema);
