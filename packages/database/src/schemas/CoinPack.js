/**
 * CoinPack — regional coin packs (Phase 5). Validator: pack.country must match user.country.
 * Fields: country, price (cents), currency, coins. Optional: packId/label for display.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    country:  { type: String, required: true, index: true },   // ISO 3166-1 alpha-2 (e.g. US, IN, BR)
    price:    { type: Number, required: true, min: 0 },         // price in cents
    currency: { type: String, required: true, default: 'USD' },
    coins:    { type: Number, required: true, min: 1 },
    packId:   { type: String, index: true },                    // optional id for API (e.g. 'starter', 'basic')
    label:    { type: String },
    bonusCoins: { type: Number, default: 0 },
  },
  { timestamps: true, _id: true }
);

schema.index({ country: 1, packId: 1 });

module.exports = mongoose.model('CoinPack', schema, 'coin_packs');
