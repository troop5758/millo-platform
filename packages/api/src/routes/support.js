'use strict';
/**
 * Support routes — unified `SupportTicket` model only (`packages/database/src/schemas/SupportTicket.js`).
 * Core linkage: { userId, orderId?, paymentId? }. Public tracking: `GET /ticket/:trackingId` → same collection.
 * `SupportTicketMessage` is legacy-only; new threads use embedded `messages[]`.
 *
 * Permissions (strict):
 * - Only support/admin can: view all tickets (GET /support/queue), respond to any ticket, PATCH any ticket.
 * - Users can: only access their own tickets (GET /support/:id, GET/POST :id/messages). Else 403 Access denied.
 *
 * POST   /support            → create ticket (auth); optional orderId, paymentId; opens messages[] with first user line when message/description set
 * GET    /support/my         → list current user's tickets
 * GET    /support/queue      → staff only: list all tickets
 * GET    /support/:id        → owner or support/admin (users: own only)
 * GET    /support/:id/messages → owner or support/admin (users: own only)
 * POST   /support/:id/messages → owner or support/admin (users: own only)
 * PATCH  /support/:id        → support/admin only
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const dashboards = require('@millo/dashboards');
const { resolveSession } = require('./auth');
const { validateId } = require('../lib/validateId');
const { writeAdminAuditLog } = require('../services/auditLog');
const fraudService = require('../services/fraudService');
const supportTicketService = require('../services/supportTicketService');
const notifyUser = require('../lib/notifyUser');

const ISSUE_TYPES = ['NOT_DELIVERED', 'DAMAGED', 'WRONG_ITEM', 'OTHER'];
const TICKET_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'];
const TRACKING_STATUSES = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CHANNELS = ['order_issue', 'general'];

function normalizeSupportMessageRow(m) {
  return {
    ...m,
    senderId: m.senderId || m.userId,
    senderRole: m.senderRole || m.fromRole,
    message: m.message ?? m.body,
  };
}

/**
 * Merge legacy SupportTicketMessage docs with SupportTicket.messages (embedded).
 */
async function loadMergedTicketMessages(ticketId, ticketLean, limit, offset) {
  const legacy = await db.SupportTicketMessage.find({ ticketId }).sort({ createdAt: 1 }).lean();
  const embedded = Array.isArray(ticketLean?.messages) ? ticketLean.messages : [];
  const all = [...legacy.map(normalizeSupportMessageRow), ...embedded.map(normalizeSupportMessageRow)].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );
  return all.slice(offset, offset + limit);
}

async function attachMessageUserEmails(messages) {
  const ids = [...new Set(messages.map((m) => m.userId).filter(Boolean).map((id) => String(id)))];
  if (!ids.length) return messages;
  const users = await db.User.find({ _id: { $in: ids } }).select('email').lean();
  const map = Object.fromEntries(users.map((u) => [String(u._id), u]));
  return messages.map((m) => {
    const uid = m.userId;
    const row = { ...m };
    if (uid && map[String(uid)]) {
      row.userId = { _id: uid, email: map[String(uid)].email };
    }
    return row;
  });
}

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function getRequestUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const user = await resolveSession(token).catch(() => null);
    if (user) return user;
  }
  return null;
}

/**
 * Strict permissions: only support/admin can access any ticket; users can only access their own.
 * Returns true if allowed, or sends 403 { error: 'ACCESS_DENIED', message: 'Access denied' } and returns false.
 */
function assertTicketAccess(user, ticket, reply) {
  if (dashboards.hasRole(user, 'support') || dashboards.hasRole(user, 'admin')) return true;
  if (ticket.userId && String(ticket.userId) === String(user._id)) return true;
  reply.status(403).send({ error: 'ACCESS_DENIED', message: 'Access denied' });
  return false;
}

async function supportRoutes(app) {
  /* ── Public: ticket tracking by trackingId ──
   * Frontend pages `TicketTrackingPage` / `SupportTrackingPage` call `GET /ticket/:trackingId`.
   * Resolves `SupportTicket` by `ticketNumber` or `trackingId` (single support model).
   *
   * Returns only safe, non-PII fields suitable for public tracking.
   */
  app.get('/ticket/:trackingId', async (request, reply) => {
    const trackingId = request.params?.trackingId != null ? String(request.params.trackingId).trim() : '';
    if (!trackingId) return reply.status(400).send({ error: 'TRACKING_ID_REQUIRED' });

    const ticket = await db.SupportTicket.findOne({
      $or: [{ ticketNumber: trackingId }, { trackingId: trackingId }],
    }).lean();

    if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND', message: 'Ticket not found' });

    const sla =
      ticket.sla && typeof ticket.sla === 'object'
        ? ticket.sla
        : { responseDue: ticket.slaRespondBy || null, resolutionDue: ticket.slaResolveBy || null };

    return reply.send({
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      trackingId: ticket.trackingId,
      subject: ticket.subject,
      status: ticket.status,
      sla,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      issueType: ticket.issueType,
      trackingStatus: ticket.trackingStatus,
    });
  });

  /** POST /support — create support ticket (auth). Accepts subject + message (general) or orderId + issueType (order issue). */
  app.post('/support', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { orderId, paymentId, trackingNumber, carrier, issueType, description, channel, subject, message } = request.body ?? {};
    const subjectVal = subject != null ? String(subject).trim() : '';
    const messageVal = message != null ? String(message).trim() : (description != null ? String(description).trim() : '');
    const issueTypeVal = issueType && ISSUE_TYPES.includes(issueType) ? issueType : 'OTHER';
    const channelVal = channel && CHANNELS.includes(channel) ? channel : (orderId ? 'order_issue' : 'general');

    let orderIdValid = null;
    if (orderId) {
      if (!validateId(orderId, reply)) return;
      const order = await db.Order.findById(orderId).lean();
      if (!order) return reply.status(404).send({ error: 'ORDER_NOT_FOUND' });
      if (order.userId.toString() !== user._id.toString()) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Order does not belong to you' });
      }
      orderIdValid = order._id;
    }

    let paymentIdValid = null;
    if (paymentId) {
      if (!validateId(paymentId, reply)) return;
      const pt = await db.PaymentTransaction.findById(paymentId).lean();
      if (!pt) return reply.status(404).send({ error: 'PAYMENT_NOT_FOUND' });
      if (!pt.userId || String(pt.userId) !== String(user._id)) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Payment does not belong to you' });
      }
      paymentIdValid = pt._id;
    }

    const initialMessages = messageVal
      ? [{
        userId: user._id,
        senderId: user._id,
        fromRole: 'user',
        senderRole: 'user',
        body: messageVal,
        message: messageVal,
        attachments: [],
        seen: false,
      }]
      : [];

    const trackingId = supportTicketService.generateTicketNumber();
    const { slaRespondBy, slaResolveBy, sla } = supportTicketService.getSlaDefaults();

    const ticket = await db.SupportTicket.create({
      userId: user._id,
      orderId: orderIdValid || undefined,
      paymentId: paymentIdValid || undefined,
      status: 'OPEN',
      messages: initialMessages,
      ticketNumber: trackingId,
      trackingId,
      subject: subjectVal,
      message: messageVal,
      trackingNumber: trackingNumber != null ? String(trackingNumber).trim() : '',
      carrier: carrier != null ? String(carrier).trim() : '',
      issueType: issueTypeVal,
      description: messageVal || (description != null ? String(description).trim() : ''),
      channel: channelVal,
      slaRespondBy,
      slaResolveBy,
      sla: { responseDue: sla.responseDue, resolutionDue: sla.resolutionDue },
    });

    let out = ticket.toObject ? ticket.toObject() : ticket;
    try {
      const assigned = await supportTicketService.assignAgentToTicket(ticket._id);
      if (assigned) out = assigned;
    } catch (_) {}

    if (out.trackingNumber && out.carrier) {
      try {
        const { getTrackingSupportQueue } = require('../lib/trackingQueue');
        getTrackingSupportQueue().add('verify', { ticketId: String(ticket._id) }, { jobId: `tracking-${ticket._id}`, removeOnComplete: 100 });
      } catch (_) {}
    }

    try {
      await notifyUser(user._id, {
        type: 'support_ticket_created',
        title: 'Support ticket created',
        body: `Your ticket ${trackingId} has been created. We'll respond soon.`,
        meta: { ticketId: String(ticket._id), ticketNumber: trackingId, trackingId },
        url: `/support/${ticket._id}`,
      });
      const agentIds = await supportTicketService.getSupportAgentIds();
      for (const aid of agentIds) {
        await notifyUser(aid, {
          type: 'support_new_ticket',
          title: 'New support ticket',
          body: `${trackingId} — ${out.subject || out.issueType}`,
          meta: { ticketId: String(ticket._id), ticketNumber: trackingId, trackingId, userId: String(out.userId) },
        });
      }
    } catch (_) {}

    return reply.status(201).send(out);
  });

  /** GET /support/queue — staff only: list all SupportTickets with filters (SLA + routing view) */
  app.get('/support/queue', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(user, 'support') && !dashboards.hasRole(user, 'admin')) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const offset = Math.max(0, Number(request.query?.offset) || 0);
    const status = request.query?.status ? String(request.query.status).trim() : null;
    const assignedTo = request.query?.assignedTo ? String(request.query.assignedTo).trim() : null;
    const query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    const [tickets, total] = await Promise.all([
      db.SupportTicket.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).populate('assignedTo', 'email').populate('userId', 'email').lean(),
      db.SupportTicket.countDocuments(query),
    ]);
    return reply.send({ tickets, total, limit, offset });
  });

  /** GET /support/my — list current user's tickets, newest first */
  app.get('/support/my', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const tickets = await db.SupportTicket.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('assignedTo', 'email')
      .lean();

    return reply.send({ tickets });
  });

  /** GET /support/:id — get one ticket (owner or support/admin). Users can only access their own. */
  app.get('/support/:id', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.id, reply)) return;

    const ticket = await db.SupportTicket.findById(request.params.id).populate('assignedTo', 'email').lean();
    if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' });
    if (!assertTicketAccess(user, ticket, reply)) return;

    return reply.send(ticket);
  });

  /** GET /support/:id/messages — list messages (owner or support/admin). Users can only access their own. */
  app.get('/support/:id/messages', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.id, reply)) return;

    const ticket = await db.SupportTicket.findById(request.params.id).lean();
    if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' });
    if (!assertTicketAccess(user, ticket, reply)) return;

    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const offset = Math.max(0, Number(request.query?.offset) || 0);
    const merged = await loadMergedTicketMessages(request.params.id, ticket, limit, offset);
    const out = await attachMessageUserEmails(merged);

    return reply.send({ messages: out });
  });

  /** POST /support/:id/messages — send message (owner or support/admin). Body: message|body, optional attachments[]. */
  app.post('/support/:id/messages', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.id, reply)) return;

    const body = (request.body?.message ?? request.body?.body) != null ? String(request.body.message ?? request.body.body).trim() : '';
    if (!body) return reply.status(400).send({ error: 'BODY_REQUIRED', message: 'Message body required (max 5000 chars)' });

    const attachments = Array.isArray(request.body?.attachments) ? request.body.attachments : [];

    try {
      const { addSupportMessage } = require('../lib/supportChatHandler');
      const { broadcastToTicketRoom } = require('./userWs');
      const { message } = await addSupportMessage(user, request.params.id, body, attachments);
      try {
        broadcastToTicketRoom(request.params.id, { type: 'new_message', data: { ticketId: String(request.params.id), ...message } });
      } catch (_) {}
      return reply.status(201).send(message);
    } catch (e) {
      if (e.message === 'TICKET_NOT_FOUND') return reply.status(404).send({ error: 'TICKET_NOT_FOUND' });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'ACCESS_DENIED', message: 'Access denied' });
      if (e.message === 'BODY_REQUIRED') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  /** PATCH /support/:id — admin/support only: status, adminNotes, trackingStatus, assignedTo, priority, SLA */
  app.patch('/support/:id', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(user, 'support') && !dashboards.hasRole(user, 'admin')) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (!validateId(request.params.id, reply)) return;

    const { status, adminNotes, trackingStatus, assignedTo, priority, slaRespondBy, slaResolveBy } = request.body ?? {};
    const update = { updatedAt: new Date() };
    if (status !== undefined) {
      if (!TICKET_STATUSES.includes(status)) {
        return reply.status(400).send({ error: 'INVALID_STATUS', message: 'status must be one of: OPEN, IN_REVIEW, RESOLVED, REJECTED' });
      }
      update.status = status;
    }
    if (adminNotes !== undefined) update.adminNotes = String(adminNotes).trim();
    if (trackingStatus !== undefined) {
      if (!TRACKING_STATUSES.includes(trackingStatus)) {
        return reply.status(400).send({ error: 'INVALID_TRACKING_STATUS', message: 'trackingStatus must be one of: PENDING, IN_TRANSIT, DELIVERED, FAILED' });
      }
      update.trackingStatus = trackingStatus;
    }
    if (assignedTo !== undefined) {
      if (assignedTo === null) {
        update.assignedTo = null;
        update.assignedAt = null;
      } else {
        if (!validateId(assignedTo, reply)) return;
        const agent = await db.User.findOne({ _id: assignedTo, role: 'support', status: 'active' }).lean();
        if (!agent) return reply.status(400).send({ error: 'INVALID_AGENT', message: 'Assigned user must be an active support agent' });
        update.assignedTo = agent._id;
        update.assignedAt = new Date();
      }
    }
    if (priority !== undefined) {
      if (!PRIORITIES.includes(priority)) return reply.status(400).send({ error: 'INVALID_PRIORITY', message: 'priority must be one of: LOW, MEDIUM, HIGH, URGENT' });
      update.priority = priority;
    }
    if (slaRespondBy !== undefined) update.slaRespondBy = slaRespondBy ? new Date(slaRespondBy) : null;
    if (slaResolveBy !== undefined) update.slaResolveBy = slaResolveBy ? new Date(slaResolveBy) : null;

    const before = await db.SupportTicket.findById(request.params.id).lean();
    const ticket = await db.SupportTicket.findByIdAndUpdate(
      request.params.id,
      update,
      { new: true }
    ).populate('assignedTo', 'email').lean();
    if (!ticket) return reply.status(404).send({ error: 'TICKET_NOT_FOUND' });

    await writeAdminAuditLog({
      adminId: user._id,
      action: 'support_ticket_update',
      targetType: 'SupportTicket',
      targetId: String(ticket._id),
      meta: { status: update.status, trackingStatus: update.trackingStatus, assignedTo: update.assignedTo ? String(update.assignedTo) : null, priority: update.priority },
    });

    if (update.assignedTo && (!before.assignedTo || String(before.assignedTo) !== String(update.assignedTo))) {
      try {
        await notifyUser(ticket.userId, {
          type: 'support_ticket_assigned',
          title: 'Support agent assigned',
          body: `Your ticket ${ticket.ticketNumber || ticket._id} has been assigned.`,
          meta: { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber, assignedTo: String(update.assignedTo) },
          url: `/support/${ticket._id}`,
        });
        await notifyUser(update.assignedTo, {
          type: 'support_ticket_assigned_to_you',
          title: 'Ticket assigned to you',
          body: `${ticket.ticketNumber || ticket._id} — ${ticket.issueType}`,
          meta: { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber, userId: String(ticket.userId) },
        });
        const userSockets = require('../lib/userSockets');
        userSockets.push(String(ticket.userId), { type: 'support_ticket_updated', data: { ticketId: String(ticket._id), ticket } });
        userSockets.push(String(update.assignedTo), { type: 'support_ticket_updated', data: { ticketId: String(ticket._id), ticket } });
      } catch (_) {}
    }

    if (ticket.trackingStatus === 'DELIVERED' && ticket.issueType === 'NOT_DELIVERED') {
      await fraudService.flagSupportFraud(ticket.userId, 'POTENTIAL_FALSE_CLAIM', {
        supportTicketId: String(ticket._id),
        orderId: ticket.orderId ? String(ticket.orderId) : null,
      });
    }

    return reply.send(ticket);
  });
}

module.exports = { supportRoutes };
