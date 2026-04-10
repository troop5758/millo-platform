/**
 * CreatorTier — creators unlock better revenue share as they grow.
 * Tiers are ordered by minimum_subscribers; creator's tier = highest where subscribers >= minimum.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:                    { type: String, required: true, unique: true, index: true },
    minimumSubscribers:      { type: Number, default: 0, index: true },
    subscriptionPlatformFee: { type: Number, default: 25 },  // % platform retains on subscriptions
    ppvPlatformFee:          { type: Number, default: 25 },  // % platform retains on PPV
    shopCommission:          { type: Number, default: 25 },   // % platform commission on shop
    liveCommission:         { type: Number, default: 25 },   // % platform commission on live/gifts
    benefits:               [{ type: String }],
    sortOrder:              { type: Number, default: 0 },    // for display order
  },
  { timestamps: true, _id: true }
);

schema.index({ minimumSubscribers: -1 });

module.exports = mongoose.model('CreatorTier', schema);
