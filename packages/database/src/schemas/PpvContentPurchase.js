/**
 * PpvContentPurchase — records when a user pays to unlock PPV content.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent', required: true, index: true },
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true },
    messageId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PpvMassMessage', default: null },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, contentId: 1 }, { unique: true });
schema.index({ contentId: 1, createdAt: -1 });

module.exports = mongoose.model('PpvContentPurchase', schema);
