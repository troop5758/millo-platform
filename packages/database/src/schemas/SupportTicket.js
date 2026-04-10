/**
 * SupportTicket — unified support system (single model; no separate user Ticket collection).
 *
 * Ownership / linkage (required shape for product & integrations):
 *   - userId     — ticket owner (complainant)
 *   - orderId    — optional ref to Order (shop)
 *   - paymentId  — optional ref to PaymentTransaction
 * Live commerce uses LiveTicket (different collection) for stream access SKUs — not support threads.
 * Legacy chat rows may exist only in SupportTicketMessage; API merges into GET /support/:id/messages.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

/** Documented linkage fields for support tooling (staff UI, disputes, audits). */
const CORE_LINKAGE_FIELDS = Object.freeze(['userId', 'orderId', 'paymentId']);

const supportTicketMessageEmbeddedSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromRole:    { type: String, enum: ['user', 'support', 'admin', 'system'], required: true },
    senderRole:  { type: String, enum: ['user', 'support', 'admin'] },
    body:        { type: String, required: true },
    message:     { type: String },
    attachments: { type: [String], default: [] },
    seen:        { type: Boolean, default: false },
  },
  { timestamps: true, _id: true }
);

const schema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Linked shop order (buyer must own). */
    orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    /** Linked payment ledger row (user must own). */
    paymentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', default: null, index: true },
    status:        {
      type: String,
      enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'open', 'assigned', 'in_progress', 'resolved', 'closed'],
      default: 'OPEN',
      index: true,
    },
    /** Conversation thread (canonical). */
    messages:      { type: [supportTicketMessageEmbeddedSchema], default: [] },
    /** Human-readable tracking ID (e.g. MIL-1730000000000-123456). Set on create; null for legacy. */
    ticketNumber:  { type: String, default: null, unique: true, sparse: true, index: true },
    /** Alias for ticketNumber (API compatibility). */
    trackingId:    { type: String, default: null, unique: true, sparse: true, index: true },
    subject:       { type: String, default: '' },
    message:       { type: String, default: '' },
    trackingNumber: { type: String, default: '' },
    carrier:       { type: String, default: '' },
    issueType:     {
      type: String,
      enum: ['NOT_DELIVERED', 'DAMAGED', 'WRONG_ITEM', 'OTHER'],
      default: 'OTHER',
    },
    description:   { type: String, default: '' },
    /** order_issue | general */
    channel:       { type: String, enum: ['order_issue', 'general'], default: 'order_issue' },
    trackingStatus: {
      type: String,
      enum: ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED'],
      default: 'PENDING',
    },
    adminNotes:    { type: String, default: '' },
    /** Assigned support agent */
    assignedTo:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedAt:    { type: Date, default: null },
    /** SLA: first response due (e.g. 30 min from create) */
    slaRespondBy:  { type: Date, default: null, index: true },
    /** SLA: resolve by (e.g. 24h from create) */
    slaResolveBy:  { type: Date, default: null, index: true },
    /** Nested SLA for API compatibility (responseDue / resolutionDue). */
    sla:           {
      responseDue:   { type: Date, default: null },
      resolutionDue: { type: Date, default: null },
    },
    /** Set when first support message is sent */
    firstResponseAt: { type: Date, default: null },
    priority:      { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'low', 'medium', 'high', 'urgent'], default: 'MEDIUM', index: true },
    /** Set when SLA monitor detects response due breached (escalation). */
    slaResponseBreachedAt:   { type: Date, default: null },
    /** Set when SLA monitor detects resolution due breached (escalation). */
    slaResolutionBreachedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ orderId: 1 });
schema.index({ paymentId: 1 });
schema.index({ status: 1 });
schema.index({ assignedTo: 1, status: 1 });

schema.statics.CORE_LINKAGE_FIELDS = CORE_LINKAGE_FIELDS;

module.exports = mongoose.model('SupportTicket', schema);
