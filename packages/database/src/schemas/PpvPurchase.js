/**
 * PpvPurchase — records when a user pays to unlock a paid (PPV) stream.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    streamId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, streamId: 1 }, { unique: true });
schema.index({ streamId: 1, createdAt: -1 });
schema.index({ 'meta.paymentIntentId': 1 }, { sparse: true });
schema.index({ 'meta.stripeSessionId': 1 }, { sparse: true });
schema.index({ 'meta.referenceId': 1 }, { sparse: true });

module.exports = mongoose.model('PpvPurchase', schema);
