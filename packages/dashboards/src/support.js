/**
 * Support dashboard — tickets, refund handling, user account tools.
 * Overrides logged to AdminAuditLog. https://milloapp.com
 *
 * Staff ticket create/list/respond use `SupportTicket` only (userId, orderId, paymentId, messages).
 */
const mongoose = require('mongoose');
const db = require('@millo/database');
const { writeAdminAuditLog } = db;
const roles = require('./roles');
const { USER_ACCOUNT_STATUS } = require('@millo/shared').userAccountStatus;

const SLA_RESPOND_MINUTES = Number(process.env.SUPPORT_SLA_RESPOND_MINUTES) || 30;
const SLA_RESOLVE_HOURS = Number(process.env.SUPPORT_SLA_RESOLVE_HOURS) || 24;

function staffTrackingId() {
  return `MIL-${Date.now()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
}

function slaDefaults() {
  const now = new Date();
  const slaRespondBy = new Date(now.getTime() + SLA_RESPOND_MINUTES * 60 * 1000);
  const slaResolveBy = new Date(now.getTime() + SLA_RESOLVE_HOURS * 60 * 60 * 1000);
  return {
    slaRespondBy,
    slaResolveBy,
    sla: { responseDue: slaRespondBy, resolutionDue: slaResolveBy },
  };
}

function supportTicketFilter(status) {
  if (!status) return {};
  const s = String(status).toLowerCase();
  if (s === 'open') {
    return { status: { $in: ['OPEN', 'IN_REVIEW', 'open', 'assigned', 'in_progress'] } };
  }
  if (s === 'closed') {
    return { status: { $in: ['RESOLVED', 'REJECTED', 'resolved', 'closed'] } };
  }
  return {};
}

/** Normalize list rows for `/support` staff UI. */
function normalizeTicketListRow(doc) {
  const uid = doc.userId && doc.userId.toString ? doc.userId.toString() : String(doc.userId);
  const st = String(doc.status || '');
  const up = st.toUpperCase();
  const closedLike = ['RESOLVED', 'REJECTED', 'CLOSED', 'resolved', 'closed'].includes(st)
    || ['RESOLVED', 'REJECTED', 'CLOSED'].includes(up);
  const uiStatus = closedLike ? 'closed' : 'open';
  const p = (doc.priority && String(doc.priority).toLowerCase()) || '';
  let priorityForBadge = 'open';
  if (p === 'high' || p === 'urgent') priorityForBadge = 'high';
  else priorityForBadge = closedLike ? 'resolved' : 'open';

  return {
    ...doc,
    _id: doc._id,
    userId: uid,
    subject: doc.subject,
    status: uiStatus,
    priority: priorityForBadge,
    ticketSource: 'support_ticket',
    ticketNumber: doc.ticketNumber || doc.trackingId || null,
  };
}

/**
 * @param {object} supportUser
 * @param {string} userId — ticket owner
 * @param {string} subject
 * @param {string} [message]
 * @param {{ orderId?: string, paymentId?: string }} [links] — optional; must belong to userId (same rules as POST /support)
 */
async function ticketCreate(supportUser, userId, subject, message, links = {}) {
  roles.requireSupport(supportUser);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('USER_ID_REQUIRED');
  if (!mongoose.Types.ObjectId.isValid(uid)) throw new Error('INVALID_USER_ID');
  const userOk = await db.User.findById(uid).select('_id').lean();
  if (!userOk) throw new Error('USER_NOT_FOUND');

  let orderIdValid = null;
  const rawOrder = links.orderId != null ? String(links.orderId).trim() : '';
  if (rawOrder) {
    if (!mongoose.Types.ObjectId.isValid(rawOrder)) throw new Error('INVALID_ORDER_ID');
    const order = await db.Order.findById(rawOrder).lean();
    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (String(order.userId) !== uid) throw new Error('ORDER_USER_MISMATCH');
    orderIdValid = order._id;
  }

  let paymentIdValid = null;
  const rawPay = links.paymentId != null ? String(links.paymentId).trim() : '';
  if (rawPay) {
    if (!mongoose.Types.ObjectId.isValid(rawPay)) throw new Error('INVALID_PAYMENT_ID');
    const pt = await db.PaymentTransaction.findById(rawPay).lean();
    if (!pt) throw new Error('PAYMENT_NOT_FOUND');
    if (!pt.userId || String(pt.userId) !== uid) throw new Error('PAYMENT_USER_MISMATCH');
    paymentIdValid = pt._id;
  }

  const tracking = staffTrackingId();
  const first = message != null ? String(message).trim() : '';
  const messages = [];
  if (first) {
    messages.push({
      userId: uid,
      fromRole: 'user',
      body: first,
      message: first,
    });
  }

  const channel = orderIdValid || paymentIdValid ? 'order_issue' : 'general';

  const doc = await db.SupportTicket.create({
    userId: uid,
    orderId: orderIdValid || undefined,
    paymentId: paymentIdValid || undefined,
    subject,
    message: first,
    channel,
    status: 'OPEN',
    ticketNumber: tracking,
    trackingId: tracking,
    messages,
    issueType: 'OTHER',
    ...slaDefaults(),
  });
  return doc.toObject();
}

async function ticketList(supportUser, status, limit = 50) {
  roles.requireSupport(supportUser);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const modern = await db.SupportTicket.find(supportTicketFilter(status))
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
  return modern.map((d) => normalizeTicketListRow(d));
}

/**
 * Respond to a ticket (support/admin only). `SupportTicket` only.
 */
async function ticketRespond(supportUser, ticketId, responseText) {
  roles.requireSupport(supportUser);
  const text = String(responseText || '').trim();
  if (!text) throw new Error('RESPONSE_REQUIRED');
  const supportId = supportUser._id || supportUser;

  const st = await db.SupportTicket.findById(ticketId);
  if (!st) throw new Error('TICKET_NOT_FOUND');
  const cur = String(st.status || '');
  if (cur === 'OPEN' || cur === 'open') st.status = 'IN_REVIEW';
  if (!st.assignedTo) {
    st.assignedTo = supportId;
    st.assignedAt = new Date();
  }
  st.messages = st.messages || [];
  st.messages.push({
    userId: supportId,
    senderId: supportId,
    fromRole: 'support',
    senderRole: 'support',
    body: text,
    message: text,
  });
  if (!st.firstResponseAt) st.firstResponseAt = new Date();
  await st.save();
  return st.toObject();
}

async function refundHandling(supportUser, userId, amountCents, reason) {
  roles.requireSupport(supportUser);
  const supportId = supportUser._id || supportUser;
  await writeAdminAuditLog({
    action: 'refund_request',
    adminId: supportId,
    targetType: 'User',
    targetId: userId?.toString(),
    overrideReason: reason || null,
    meta: { amountCents },
  });
  return { ok: true, refundRequested: true };
}

async function userAccountTools(supportUser, action, payload) {
  roles.requireSupport(supportUser);
  const supportId = supportUser._id || supportUser;
  if (action === 'search') {
    const q = String(payload.q || '').trim();
    const limit = Math.min(Number(payload.limit) || 20, 100);
    const filter = {};
    if (q) {
      const isObjectId = /^[a-fA-F0-9]{24}$/.test(q);
      if (isObjectId) {
        filter._id = q;
      } else {
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const profileIds = await db.Profile.find({
          $or: [
            { displayName: new RegExp(safe, 'i') },
            { 'meta.username': new RegExp(safe, 'i') },
          ],
        }).distinct('userId');
        filter.$or = [
          { email: new RegExp(safe, 'i') },
          ...(profileIds.length ? [{ _id: { $in: profileIds } }] : []),
        ];
      }
    }
    const users = await db.User.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const withProfile = await Promise.all(users.map(async (u) => {
      const p = await db.Profile.findOne({ userId: u._id }).lean();
      return {
        ...u,
        displayName: p?.displayName || u.email?.split('@')[0],
        username: p?.meta?.username,
        avatarUrl: p?.avatarUrl,
      };
    }));
    return { users: withProfile, total: withProfile.length };
  }
  if (action === 'getUser') {
    const user = await db.User.findById(payload.userId).lean();
    if (!user) throw new Error('USER_NOT_FOUND');
    return user;
  }
  if (action === 'setFlag') {
    const user = await db.User.findById(payload.userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.flags = user.flags || {};
    user.flags[payload.key] = payload.value;
    await user.save();
    await writeAdminAuditLog({
      action: 'user_account_set_flag',
      adminId: supportId,
      targetType: 'User',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: { key: payload.key, value: payload.value },
    });
    return { ok: true };
  }
  if (action === 'suspend') {
    const user = await db.User.findById(payload.userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.status = USER_ACCOUNT_STATUS.SUSPENDED;
    user.flags = user.flags || {};
    user.flags.suspended = true;
    await user.save();
    await writeAdminAuditLog({
      action: 'user_suspend',
      adminId: supportId,
      targetType: 'User',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: {},
    });
    return { ok: true, suspended: true };
  }
  if (action === 'unsuspend') {
    const user = await db.User.findById(payload.userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.status === USER_ACCOUNT_STATUS.BANNED) throw new Error('USER_BANNED');
    user.status = USER_ACCOUNT_STATUS.ACTIVE;
    user.flags = user.flags || {};
    user.flags.suspended = false;
    await user.save();
    await writeAdminAuditLog({
      action: 'user_unsuspend',
      adminId: supportId,
      targetType: 'User',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: {},
    });
    return { ok: true, suspended: false };
  }
  if (action === 'ban') {
    roles.requireAdmin(supportUser);
    const user = await db.User.findById(payload.userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.status = USER_ACCOUNT_STATUS.BANNED;
    user.flags = user.flags || {};
    user.flags.suspended = true;
    await user.save();
    await writeAdminAuditLog({
      action: 'user_ban',
      adminId: supportId,
      targetType: 'User',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: {},
    });
    return { ok: true, banned: true, status: user.status };
  }
  if (action === 'unban') {
    roles.requireAdmin(supportUser);
    const user = await db.User.findById(payload.userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.status = USER_ACCOUNT_STATUS.ACTIVE;
    user.flags = user.flags || {};
    user.flags.suspended = false;
    await user.save();
    await writeAdminAuditLog({
      action: 'user_unban',
      adminId: supportId,
      targetType: 'User',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: {},
    });
    return { ok: true, banned: false, status: user.status };
  }
  throw new Error('UNKNOWN_ACTION');
}

module.exports = { ticketCreate, ticketList, ticketRespond, refundHandling, userAccountTools };
