/**
 * Subscription — MongoDB schema. https://milloapp.com
 * Fields: userId (ref User, required), creatorId (optional; null = platform sub), plan, status,
 * priceCents, externalId (Stripe subscription id), subscriptionTierId, billingInterval,
 * platformFeePercent / creatorSharePercent (snapshot at signup for recurring revenue accounting), meta.
 * Indexes: userId, creatorId+status, status+endsAt, externalId.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = platform subscription
    plan:      { type: String, required: true },
    status:    { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active' },
    priceCents:{ type: Number, default: 0 },
    externalId:{ type: String, default: null }, // Stripe subscription ID
    subscriptionTierId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionTier', default: null },
    billingInterval: { type: String, enum: ['month', 'year'], default: null },
    /** Platform take % at time of subscription (CreatorTier.subscriptionPlatformFee or equivalent). */
    platformFeePercent: { type: Number, default: null },
    /** Creator share % at time of subscription (100 - platform fee). */
    creatorSharePercent: { type: Number, default: null },
    startsAt:  { type: Date, required: true },
    endsAt:    { type: Date },
    meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 });
schema.index({ creatorId: 1, status: 1 });
schema.index({ status: 1, endsAt: 1 });
schema.index({ externalId: 1 }, { sparse: true });

module.exports = mongoose.model('Subscription', schema);
