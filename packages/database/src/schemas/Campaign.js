/**
 * Campaign — MongoDB schema. https://milloapp.com
 * Fields: name (required), status (enum draft|active|paused|ended), startsAt, endsAt, meta (mixed). Timestamps.
 * Indexes: status, startsAt+endsAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:           { type: String, required: true, trim: true, maxlength: 200 },
    objective:      { type: String, enum: ['awareness', 'traffic', 'conversions', 'followers'], default: 'awareness' },
    status:         { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft', index: true },
    budgetCents:    { type: Number, default: 0 },     // total budget
    spentCents:     { type: Number, default: 0 },     // running total spent
    dailyCapCents:  { type: Number, default: 0 },     // 0 = unlimited
    targetAudience: { type: mongoose.Schema.Types.Mixed, default: {} }, // { countries, categories, ageRange }
    startsAt:       { type: Date },
    endsAt:         { type: Date },
    impressions:    { type: Number, default: 0 },
    clicks:         { type: Number, default: 0 },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1 });
schema.index({ startsAt: 1, endsAt: 1 });

module.exports = mongoose.model('Campaign', schema);
