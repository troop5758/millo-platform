/**
 * PayoutHold — high-risk creator earnings held until hold_until.
 * Layer 3 payout risk control. https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true },
    holdUntil:  { type: Date, required: true, index: true },
    reason:     { type: String, default: 'high_risk' },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, holdUntil: 1 });

module.exports = mongoose.model('PayoutHold', schema);
