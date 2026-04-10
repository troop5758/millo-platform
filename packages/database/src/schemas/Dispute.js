/**
 * Dispute — marketplace transaction dispute handling.
 * Fields: transactionId (Order or PaymentTransaction id), userId (buyer / complainant), optional orderId|paymentId|supportTicketId for unified money/support linkage.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Denormalized shop order when transactionId resolves to Order. */
    orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    /** Denormalized payment ledger row when transactionId resolves to PaymentTransaction. */
    paymentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null, index: true },
    /** Optional link to an existing support thread for the same buyer + money scope. */
    supportTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', default: null, index: true },
    reason:        { type: String, default: '' },
    status:        { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
    resolvedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt:    { type: Date },
    resolutionNote: { type: String },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1 });
schema.index({ transactionId: 1 });
schema.index({ transactionId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('Dispute', schema);
