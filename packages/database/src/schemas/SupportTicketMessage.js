/**
 * SupportTicketMessage — legacy per-message collection (pre-unified model).
 * New messages are stored on SupportTicket.messages; GET /support/:id/messages merges legacy + embedded.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    ticketId:    { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromRole:   { type: String, enum: ['user', 'support', 'admin', 'system'], required: true },
    senderRole: { type: String, enum: ['user', 'support', 'admin'] },
    body:       { type: String, required: true },
    message:    { type: String },
    attachments: { type: [String], default: [] },
    seen:       { type: Boolean, default: false },
  },
  { timestamps: true, _id: true }
);

schema.index({ ticketId: 1, createdAt: 1 });
schema.index({ ticketId: 1, seen: 1 });

module.exports = mongoose.model('SupportTicketMessage', schema);
