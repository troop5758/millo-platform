'use strict';
/**
 * PlatformCreatorAccess — hybrid creator unlock: $4.99/month or $69 one-time lifetime.
 * Tracks Stripe subscription (monthly) or one-time payment (lifetime).
 * When active, user is treated as creator (creatorStatus approved, role creator).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:                 { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:                   { type: String, enum: ['monthly', 'lifetime'], required: true, index: true },
    status:                 { type: String, enum: ['active', 'canceled', 'expired'], default: 'active', index: true },
    amountCents:            { type: Number, required: true }, // 499 monthly, 6900 lifetime
    currency:               { type: String, default: 'USD' },
    stripeSubscriptionId:   { type: String, default: null, sparse: true }, // monthly only
    stripePriceId:         { type: String, default: null },
    stripeCustomerId:      { type: String, default: null },
    stripeSessionId:       { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },  // lifetime one-time
    expiresAt:             { type: Date, default: null },   // monthly: next billing; lifetime: null
    canceledAt:            { type: Date, default: null },
    meta:                  { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, type: 1, status: 1 });
schema.index({ userId: 1, status: 1 });
schema.index({ expiresAt: 1 }, { sparse: true });
schema.index({ stripeSubscriptionId: 1 }, { sparse: true });

module.exports = mongoose.model('PlatformCreatorAccess', schema);
