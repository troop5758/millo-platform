'use strict';
/**
 * CreatorWallet — Phase 5 Global Creator Monetization.
 * Creator-specific wallet: balance, pending (hold), withdrawable, last payout.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance:              { type: Number, default: 0 },           // total balance in smallest currency unit (cents)
    currency:             { type: String, default: 'USD', trim: true, uppercase: true },
    pendingBalance:       { type: Number, default: 0 },           // funds in hold period (cents)
    withdrawableBalance:   { type: Number, default: 0 },           // available to payout (cents)
    lastPayout:           { type: Date, default: null },
    stripeConnectAccountId: { type: String, default: null, index: true },
    paypalPayoutEmail:    { type: String, default: null },
    wiseProfileId:        { type: String, default: null },
    payoutThresholdCents: { type: Number, default: 1000 },        // min payout (e.g. $10)
    /** Admin payout freeze: when true, creator cannot withdraw. Set by admin for fraud/safety. */
    payoutFrozen:         { type: Boolean, default: false, index: true },
    payoutFrozenAt:       { type: Date, default: null },
    payoutFrozenReason:   { type: String, trim: true, maxlength: 500, default: null },
    payoutFrozenBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    meta:                 { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1 }, { unique: true });
schema.index({ stripeConnectAccountId: 1 });

module.exports = mongoose.model('CreatorWallet', schema);
