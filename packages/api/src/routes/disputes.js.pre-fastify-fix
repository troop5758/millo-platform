'use strict';
/**
 * Disputes API — marketplace transaction dispute handling.
 *
 * POST body: transactionId (Order or PaymentTransaction id), reason, optional userId (staff on behalf),
 *   optional supportTicketId (must match buyer + same order/payment when ticket has ids).
 * Creates rows with denormalized orderId / paymentId for support–money linkage.
 *
 * POST   /disputes, /admin/disputes, /api/disputes — create dispute
 * GET    /disputes, /admin/disputes, /api/disputes — list disputes
 * GET    /disputes/:id, /admin/disputes/:id, /api/disputes/:id — get dispute
 * PATCH  /disputes/:id, /admin/disputes/:id, /api/disputes/:id — update dispute status
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const { writeAdminAuditLog, writeAuditLog } = require('../services/auditLog');
const dashboards = require('@millo/dashboards');
const { validateId } = require('../lib/validateId');

async function getRequestUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const { resolveSession } = require('./auth');
    const user = await resolveSession(token).catch(() => null);
    if (user) return user;
  }
  if (process.env.NODE_ENV !== 'production') {
    const id = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'user';
    if (id) return { _id: id, role };
  }
  return null;
}

function canManageDisputes(user) {
  return dashboards.hasRole(user, 'admin')
    || dashboards.hasRole(user, 'support')
    || dashboards.hasRole(user, 'ops');
}

/**
 * Resolve `transactionId` to a marketplace row and buyer (complainant must match unless staff opens on behalf).
 * @returns {Promise<{ orderId: import('mongoose').Types.ObjectId|null, paymentId: import('mongoose').Types.ObjectId|null, buyerId: string }|null>}
 */
async function resolveDisputeTransaction(transactionId) {
  const oid = transactionId;
  const order = await db.Order.findById(oid).select('userId').lean();
  if (order && order.userId) {
    return { orderId: order._id, paymentId: null, buyerId: String(order.userId) };
  }
  const pt = await db.PaymentTransaction.findById(oid).select('userId').lean();
  if (pt) {
    if (!pt.userId) return null;
    return { orderId: null, paymentId: pt._id, buyerId: String(pt.userId) };
  }
  return null;
}

async function disputesRoutes(app) {
  /* ── Create dispute ── */
  app.post(['/disputes', '/admin/disputes'], async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { transactionId, reason, userId, supportTicketId } = req.body ?? {};
    if (!transactionId) return reply.status(400).send({ error: 'TRANSACTION_ID_REQUIRED' });
    if (!validateId(transactionId, reply)) return;
    if (supportTicketId != null && supportTicketId !== '' && !validateId(supportTicketId, reply)) return;
    const reasonStr = (reason && String(reason).trim()) || '';
    if (reasonStr.length > 2000) return reply.status(400).send({ error: 'REASON_TOO_LONG', message: 'Reason must be 2000 characters or fewer' });
    try {
      const isManager = canManageDisputes(user);
      if (isManager && userId && !validateId(userId, reply)) return;
      const targetUserId = isManager && userId ? userId : user._id;

      const resolved = await resolveDisputeTransaction(transactionId);
      if (!resolved) {
        return reply.status(404).send({ error: 'TRANSACTION_NOT_FOUND', message: 'transactionId must be an Order or PaymentTransaction id' });
      }
      if (String(resolved.buyerId) !== String(targetUserId)) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Only the buyer for this transaction may open a dispute' });
      }

      let ticketLink = null;
      if (supportTicketId) {
        const st = await db.SupportTicket.findById(supportTicketId).select('userId orderId paymentId').lean();
        if (!st) return reply.status(404).send({ error: 'SUPPORT_TICKET_NOT_FOUND' });
        if (String(st.userId) !== String(targetUserId)) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Support ticket does not belong to complainant' });
        }
        if (resolved.orderId && st.orderId && String(st.orderId) !== String(resolved.orderId)) {
          return reply.status(400).send({ error: 'SUPPORT_TICKET_ORDER_MISMATCH' });
        }
        if (resolved.paymentId && st.paymentId && String(st.paymentId) !== String(resolved.paymentId)) {
          return reply.status(400).send({ error: 'SUPPORT_TICKET_PAYMENT_MISMATCH' });
        }
        ticketLink = supportTicketId;
      }

      const dup = await db.Dispute.findOne({
        transactionId,
        userId: targetUserId,
        status: { $in: ['open', 'investigating'] },
      }).select('_id').lean();
      if (dup) {
        return reply.status(409).send({ error: 'DISPUTE_ALREADY_OPEN', disputeId: String(dup._id) });
      }

      const dispute = await db.Dispute.create({
        transactionId,
        userId: targetUserId,
        orderId: resolved.orderId || undefined,
        paymentId: resolved.paymentId || undefined,
        supportTicketId: ticketLink || undefined,
        reason: reasonStr,
        status: 'open',
      });
      const dObj = dispute.toObject ? dispute.toObject() : dispute;
      await writeAuditLog({
        action: 'DISPUTE_CREATED',
        actorId: user._id,
        resourceType: 'Dispute',
        resourceId: String(dispute._id),
        meta: {
          transactionId: String(transactionId),
          orderId: resolved.orderId ? String(resolved.orderId) : null,
          paymentId: resolved.paymentId ? String(resolved.paymentId) : null,
          supportTicketId: ticketLink ? String(ticketLink) : null,
          complainantUserId: String(targetUserId),
          openedByUserId: String(user._id),
          adminOnBehalf: isManager && userId ? true : false,
        },
      });
      return reply.status(201).send(dObj);
    } catch (e) {
      throw e;
    }
  });

  /* ── List disputes ── */
  app.get(['/disputes', '/admin/disputes', '/api/disputes'], async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const limit = Math.min(Number(req.query?.limit) || 50, 100);
    const status = req.query?.status;
    let query = {};
    if (canManageDisputes(user)) {
      if (status && ['open', 'investigating', 'resolved'].includes(status)) query.status = status;
    } else {
      query.userId = user._id;
      if (status && ['open', 'investigating', 'resolved'].includes(status)) query.status = status;
    }
    const disputes = await db.Dispute.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    return reply.send(disputes);
  });

  /* ── Get dispute ── */
  app.get(['/disputes/:id', '/admin/disputes/:id'], async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(req.params.id, reply)) return;
    const dispute = await db.Dispute.findById(req.params.id).lean();
    if (!dispute) return reply.status(404).send({ error: 'NOT_FOUND' });
    const isOwner = String(dispute.userId) === String(user._id);
    if (!isOwner && !canManageDisputes(user)) return reply.status(403).send({ error: 'FORBIDDEN' });
    return reply.send(dispute);
  });

  /* ── Update dispute status (admin/support) ── */
  app.patch(['/disputes/:id', '/admin/disputes/:id', '/api/disputes/:id'], async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!canManageDisputes(user)) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    const { status, resolutionNote } = req.body ?? {};
    const validStatus = ['open', 'investigating', 'resolved'];
    if (!status || !validStatus.includes(status)) return reply.status(400).send({ error: 'INVALID_STATUS', message: `status must be one of: ${validStatus.join(', ')}` });
    const dispute = await db.Dispute.findById(req.params.id);
    if (!dispute) return reply.status(404).send({ error: 'NOT_FOUND' });
    const prevStatus = dispute.status;
    dispute.status = status;
    if (status === 'resolved') {
      dispute.resolvedBy = user._id;
      dispute.resolvedAt = new Date();
      dispute.resolutionNote = resolutionNote && String(resolutionNote).trim().slice(0, 2000) || undefined;
    } else {
      dispute.resolvedBy = undefined;
      dispute.resolvedAt = undefined;
      dispute.resolutionNote = undefined;
    }
    await dispute.save();
    await writeAdminAuditLog({
      adminId: user._id,
      action: 'DISPUTE_STATUS_UPDATED',
      targetType: 'Dispute',
      targetId: String(dispute._id),
      meta: {
        disputeId: String(dispute._id),
        transactionId: String(dispute.transactionId),
        userId: String(dispute.userId),
        prevStatus,
        newStatus: status,
        resolutionNote: dispute.resolutionNote,
      },
    });
    return reply.send(dispute.toObject ? dispute.toObject() : dispute);
  });
}

module.exports = { disputesRoutes };
