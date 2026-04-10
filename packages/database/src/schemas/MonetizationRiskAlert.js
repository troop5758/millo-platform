/**
 * MonetizationRiskAlert — Alerts to fraud team for suspicious gift loops, revenue spikes, chargeback spikes, abnormal subscriptions.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const TRIGGERS = ['suspicious_gift_loops', 'revenue_spike', 'chargeback_spike', 'abnormal_subscriptions'];

const schema = new mongoose.Schema(
  {
    trigger:  { type: String, enum: TRIGGERS, required: true, index: true },
    meta:    { type: mongoose.Schema.Types.Mixed, default: {} },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ trigger: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

module.exports = mongoose.model('MonetizationRiskAlert', schema);
module.exports.TRIGGERS = TRIGGERS;
