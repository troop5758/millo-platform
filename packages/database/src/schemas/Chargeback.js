/**
 * Chargeback — fraud prevention. Records Stripe disputes/chargebacks.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    stripeDisputeId:  { type: String, required: true, unique: true, index: true },
    stripeChargeId:   { type: String, index: true },
    transactionId:    { type: String, index: true },
    amountCents:      { type: Number, required: true },
    currency:         { type: String, default: 'usd' },
    status:           { type: String, enum: ['open', 'won', 'lost', 'warning_closed'], default: 'open', index: true },
    reason:           { type: String },
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    refType:          { type: String },
    refId:            { type: String },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Chargeback', schema);
