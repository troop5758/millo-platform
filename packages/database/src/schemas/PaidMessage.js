/**
 * PaidMessage — DM unlock offer. Creator sends locked content to recipient;
 * recipient must pay before expires_at or message expires.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent', required: true, index: true },
    priceCents:  { type: Number, required: true },
    status:      { type: String, enum: ['pending', 'paid', 'expired'], default: 'pending', index: true },
    expires_at:  { type: Date, required: true, index: true },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, expires_at: 1 });

module.exports = mongoose.model('PaidMessage', schema);
