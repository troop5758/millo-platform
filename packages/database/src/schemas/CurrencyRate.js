'use strict';
/**
 * CurrencyRate — Phase 2 FX rates. 1 USD = rate × local_currency.
 * Updated by currencyService.updateDailyFXRates().
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    currency:   { type: String, required: true, unique: true, trim: true, uppercase: true },
    rate:       { type: Number, required: true, min: 0 },   // 1 USD = rate units of currency
    updatedAt:  { type: Date, default: Date.now },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ currency: 1 }, { unique: true });
schema.index({ updatedAt: -1 });

module.exports = mongoose.model('CurrencyRate', schema, 'currency_rates');
