/**
 * DashboardWidget — MongoDB schema. https://milloapp.com
 * Fields: dashboardId (ref Dashboard, required), type (required), config (mixed), order (default 0). Timestamps.
 * Indexes: dashboardId+order.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    dashboardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dashboard', required: true },
    type: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, _id: true }
);

schema.index({ dashboardId: 1, order: 1 });

module.exports = mongoose.model('DashboardWidget', schema);
