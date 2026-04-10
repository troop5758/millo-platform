/**
 * Gift — Virtual gift catalog. Types: 2D, 3D, AI-generated. name, value/cost (wallet units), priceCoins, animationUrl, soundUrl.
 * Settlement on send uses CreatorTier live split (`@millo/economy` gifts.sendGift), not a fixed % of `value`.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    /** Optional catalog face value in same units as `cost` (internal coin/cents); falls back to `cost` / config if unset. */
    value: { type: Number, default: null },
    type: {
      type: String,
      enum: ['2d', '3d', 'ai'],
      default: '2d',
    },
    cost: { type: Number, default: 1 },
    priceCoins: { type: Number, default: null },
    label: { type: String, default: '' },
    icon: { type: String, default: null },
    animationUrl: { type: String, default: null },
    soundUrl: { type: String, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ priceCoins: 1 });

schema.index({ type: 1 });
schema.index({ active: 1 });

module.exports = mongoose.model('Gift', schema);
