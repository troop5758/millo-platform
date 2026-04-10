/**
 * Order — shop purchase. Phase 10: customs mode for international shipping.
 * Created on Stripe checkout.session.completed (mode: payment).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:        { type: String, required: true },
    qty:         { type: Number, required: true, min: 1 },
    priceCents:  { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items:            [orderItemSchema],
    totalCents:       { type: Number, required: true, min: 0 },
    status:           { type: String, enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], default: 'paid', index: true },
    stripeSessionId:  { type: String, default: null, index: true },
    shippingAddress:  { type: mongoose.Schema.Types.Mixed, default: {} },
    customsMode:      { type: String, enum: ['DAP', 'DDP'], default: 'DAP' },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ 'items.creatorId': 1, createdAt: -1 });

module.exports = mongoose.model('Order', schema);
