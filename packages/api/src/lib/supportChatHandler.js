'use strict';
/**
 * Support chat handler — persist message and push to parties. Used by REST and WebSocket.
 * https://milloapp.com
 */
const db = require('@millo/database');
const dashboards = require('@millo/dashboards');
const supportTicketService = require('../services/supportTicketService');
const userSockets = require('./userSockets');
const notifyUser = require('./notifyUser');
const { writeAdminAuditLog } = require('../services/auditLog');

/**
 * Add a message to a support ticket. Caller must have verified access.
 * @param {{ _id: ObjectId, role?: string }} user - authenticated user
 * @param {string} ticketId - SupportTicket _id
 * @param {string} body - message text (trimmed, 1-5000 chars)
 * @param {string[]} [attachments] - optional attachment URLs
 * @returns {{ message: object, ticket: object }}
 */
async function addSupportMessage(user, ticketId, body, attachments = []) {
  const ticket = await db.SupportTicket.findById(ticketId);
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  const isOwner = ticket.userId && String(ticket.userId) === String(user._id);
  const isStaff = dashboards.hasRole(user, 'support') || dashboards.hasRole(user, 'admin');
  if (!isOwner && !isStaff) throw new Error('FORBIDDEN');

  const text = String(body || '').trim();
  if (!text || text.length > 5000) throw new Error('BODY_REQUIRED');

  const fromRole = isStaff ? (user.role === 'admin' ? 'admin' : 'support') : 'user';
  const senderRole = fromRole === 'system' ? 'support' : fromRole;
  const arr = Array.isArray(attachments) ? attachments.slice(0, 10).filter((a) => typeof a === 'string' && a.length) : [];

  const subDoc = {
    userId: user._id,
    senderId: user._id,
    fromRole,
    senderRole,
    body: text,
    message: text,
    attachments: arr,
    seen: false,
  };

  const setFirst = fromRole === 'support' && !ticket.firstResponseAt ? { firstResponseAt: new Date() } : {};
  await db.SupportTicket.updateOne(
    { _id: ticket._id },
    { $push: { messages: subDoc }, $set: setFirst }
  );

  const fresh = await db.SupportTicket.findById(ticket._id).lean();
  const msg = fresh?.messages?.length ? fresh.messages[fresh.messages.length - 1] : { ...subDoc, _id: null, createdAt: new Date(), updatedAt: new Date() };

  if (isStaff) {
    await writeAdminAuditLog({
      adminId: user._id,
      action: 'support_ticket_message',
      targetType: 'SupportTicket',
      targetId: String(ticket._id),
      meta: { messageId: msg._id ? String(msg._id) : null, fromRole },
    });
  }

  const ticketIdStr = String(ticket._id);
  const trackingLabel = ticket.trackingId || ticket.ticketNumber || ticketIdStr;

  const msgObj = msg && typeof msg.toObject === 'function' ? msg.toObject() : { ...msg };
  const payload = { type: 'support_message', data: { ticketId: ticketIdStr, message: msgObj } };
  const newMessagePayload = { type: 'new_message', data: { ticketId: ticketIdStr, ...msgObj } };
  userSockets.push(String(ticket.userId), payload);
  userSockets.push(String(ticket.userId), newMessagePayload);
  if (ticket.assignedTo) {
    userSockets.push(String(ticket.assignedTo), payload);
    userSockets.push(String(ticket.assignedTo), newMessagePayload);
  } else {
    const agentIds = await supportTicketService.getSupportAgentIds();
    userSockets.pushMany(agentIds, payload);
    userSockets.pushMany(agentIds, newMessagePayload);
  }

  // Emit to ticket room (req.io.to(ticketId).emit("notification", { type: "new_message", ticketId }))
  try {
    const { broadcastToTicketRoom } = require('../routes/userWs');
    broadcastToTicketRoom(ticketIdStr, { type: 'notification', data: { type: 'new_message', ticketId: ticketIdStr } });
  } catch (_) {}

  const notifyTarget = fromRole === 'support' ? ticket.userId : (ticket.assignedTo || null);
  if (notifyTarget) {
    try {
      await notifyUser(notifyTarget, {
        type: 'support_new_message',
        title: 'New support message',
        body: text.slice(0, 100) + (text.length > 100 ? '…' : ''),
        meta: { ticketId: ticketIdStr, ticketNumber: ticket.ticketNumber, messageId: msg._id ? String(msg._id) : null },
        url: `/support/${ticket._id}`,
      });
    } catch (_) {}

    // Email hook: "Update on Ticket ${trackingId}" / "You have a new reply"
    try {
      const { sendEmailWithInboxFallback } = require('../services/notificationService');
      const recipient = await db.User.findById(notifyTarget).select('email').lean();
      if (recipient?.email) {
        await sendEmailWithInboxFallback({
          to: recipient.email,
          subject: `Update on Ticket ${trackingLabel}`,
          title: `Update on Ticket ${trackingLabel}`,
          body: 'You have a new reply',
        });
      }
    } catch (_) {}
  }

  const out = msg && typeof msg.toObject === 'function' ? msg.toObject() : { ...msgObj };
  out.senderId = out.userId || out.senderId;
  out.senderRole = out.senderRole || out.fromRole;
  out.message = out.message || out.body;
  return { message: out, ticket: fresh };
}

module.exports = { addSupportMessage };
