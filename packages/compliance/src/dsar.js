/**
 * DSAR — Data Subject Access Request (GDPR, CCPA, LGPD, PIPEDA).
 * Export, delete, request tracking.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');

const id = (v) => (v == null ? v : (v._id ? v._id.toString() : v.toString()));

const DELETION_GRACE_DAYS = 30;

async function requestDsar(userId, type, opts) {
  const uid = id(userId);
  const { lawBasis = 'gdpr', ip, userAgent } = opts || {};
  const req = await db.DsarRequest.create({
    userId: uid,
    type,
    status: 'pending',
    lawBasis: ['gdpr', 'ccpa', 'lgpd', 'pipeda'].includes(lawBasis) ? lawBasis : 'gdpr',
    ip,
    userAgent,
  });
  return req.toObject();
}

/**
 * List recent DSAR requests for the signed-in user (status visibility; LAUNCH gap P1#9).
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function listDsarForUser(userId) {
  const uid = id(userId);
  const rows = await db.DsarRequest.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('type status lawBasis createdAt completedAt')
    .lean();
  return rows.map((r) => ({
    id: r._id?.toString(),
    type: r.type,
    status: r.status,
    lawBasis: r.lawBasis,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));
}

async function exportUserData(userId) {
  const uid = id(userId);
  const [
    user,
    profile,
    sessions,
    wallet,
    ledgerEntries,
    transactions,
    reportsAsReporter,
    reportsWhereTarget,
    moderationLogsWhereSubject,
    tickets,
    consentLogs,
    appeals,
    payoutRequests,
    auditLogs,
    financialAuditLogs,
    levels,
    trustScores,
    liveStreams,
    notifications,
    subscriptions,
    dmSessions,
    paymentTransactions,
    paymentMethods,
  ] = await Promise.all([
    db.User.findById(uid).lean(),
    db.Profile.findOne({ userId: uid }).lean(),
    db.Session.find({ userId: uid }).select('-tokenHash').lean(),
    db.Wallet.findOne({ userId: uid }).lean(),
    db.LedgerEntry.find({ actorId: uid }).sort({ sequence: 1 }).limit(5000).lean(),
    (async () => {
      const w = await db.Wallet.findOne({ userId: uid });
      if (!w) return [];
      return db.Transaction.find({ walletId: w._id }).sort({ createdAt: -1 }).limit(5000).lean();
    })(),
    db.Report.find({ reporterId: uid }).lean(),
    db.Report.find({ targetId: uid }).sort({ createdAt: -1 }).limit(2000).lean(),
    db.ModerationLog.find({ targetId: uid }).sort({ createdAt: -1 }).limit(2000).lean(),
    db.SupportTicket.find({ userId: uid }).lean(),
    db.ConsentLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(2000).lean(),
    db.Appeal.find({ userId: uid }).lean(),
    db.PayoutRequest.find({ userId: uid }).lean(),
    db.AuditLog.find({ actorId: uid }).sort({ createdAt: -1 }).limit(5000).lean(),
    db.FinancialAuditLog.find({ actorId: uid }).sort({ createdAt: -1 }).limit(5000).lean(),
    db.Level.find({ userId: uid }).lean(),
    db.TrustScore.find({ userId: uid }).sort({ createdAt: -1 }).limit(1000).lean(),
    db.LiveStream.find({ userId: uid }).lean(),
    db.Notification.find({ userId: uid }).sort({ createdAt: -1 }).limit(1000).lean(),
    db.Subscription.find({ userId: uid }).lean(),
    db.DMSession.find({ $or: [{ userId: uid }, { creatorId: uid }] }).lean(),
    db.PaymentTransaction.find({ $or: [{ userId: uid }, { creatorId: uid }] }).sort({ createdAt: -1 }).limit(5000).lean(),
    db.PaymentMethod.find({ userId: uid }).lean(),
  ]);

  let balanceCents = 0;
  try {
    balanceCents = await economy.getBalance(uid);
  } catch (_) {}

  const exportDate = new Date().toISOString();
  return {
    exportDate,
    userId: uid,
    user: user || null,
    profile: profile ? { ...profile, dateOfBirth: profile.dateOfBirth?.toISOString?.() || profile.dateOfBirth } : null,
    sessions: (sessions || []).map((s) => ({ _id: id(s._id), userId: id(s.userId), expiresAt: s.expiresAt, createdAt: s.createdAt, meta: s.meta })),
    wallet: wallet ? { ...wallet, userId: id(wallet.userId) } : null,
    balanceCents,
    ledgerEntries: (ledgerEntries || []).map((e) => ({ ...e, actorId: id(e.actorId) })),
    transactions: transactions || [],
    reportsAsReporter: (reportsAsReporter || []).map((r) => ({ ...r, reporterId: id(r.reporterId) })),
    reportsWhereTarget: (reportsWhereTarget || []).map((r) => ({ ...r, reporterId: id(r.reporterId), targetId: r.targetId })),
    moderationLogsWhereSubject: (moderationLogsWhereSubject || []).map((m) => ({ ...m, moderatorId: id(m.moderatorId), targetId: m.targetId })),
    tickets: (tickets || []).map((t) => ({ ...t, userId: id(t.userId), assignedTo: t.assignedTo ? id(t.assignedTo) : null })),
    consentLogs: consentLogs || [],
    appeals: (appeals || []).map((a) => ({ ...a, userId: id(a.userId), reportId: a.reportId ? id(a.reportId) : null, decidedBy: a.decidedBy ? id(a.decidedBy) : null })),
    payoutRequests: (payoutRequests || []).map((p) => ({ ...p, userId: id(p.userId) })),
    auditLogs: (auditLogs || []).map((a) => ({ ...a, actorId: id(a.actorId) })),
    financialAuditLogs: (financialAuditLogs || []).map((a) => ({ ...a, actorId: id(a.actorId) })),
    levels: (levels || []).map((l) => ({ ...l, userId: id(l.userId) })),
    trustScores: (trustScores || []).map((t) => ({ ...t, userId: id(t.userId) })),
    liveStreams: (liveStreams || []).map((s) => ({ ...s, userId: id(s.userId) })),
    notifications: (notifications || []).map((n) => ({ ...n, userId: id(n.userId) })),
    subscriptions: (subscriptions || []).map((s) => ({ ...s, userId: id(s.userId) })),
    dmSessions: (dmSessions || []).map((d) => ({ ...d, userId: id(d.userId), creatorId: d.creatorId ? id(d.creatorId) : null })),
    paymentTransactions: (paymentTransactions || []).map((p) => ({
      ...p,
      userId: p.userId ? id(p.userId) : null,
      creatorId: p.creatorId ? id(p.creatorId) : null,
    })),
    paymentMethods: (paymentMethods || []).map((p) => ({ ...p, userId: id(p.userId) })),
  };
}

async function deleteUserData(userId, opts) {
  const uid = id(userId);
  const { immediate = false } = opts || {};
  const existing = await db.DsarRequest.findOne({ userId: uid, type: 'delete', status: 'pending' });
  if (existing && !immediate) {
    return { scheduled: true, deletionScheduledAt: existing.deletionScheduledAt || new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000) };
  }
  const req = await db.DsarRequest.findOneAndUpdate(
    { userId: uid, type: 'delete', status: 'pending' },
    { $set: { status: 'processing', deletionScheduledAt: immediate ? new Date() : new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000) } },
    { new: true, upsert: true }
  );
  if (!immediate) {
    return { scheduled: true, deletionScheduledAt: req.deletionScheduledAt, requestId: req._id };
  }
  const anonymized = `deleted_${uid}_${Date.now()}`;
  await Promise.all([
    db.Session.deleteMany({ userId: uid }),
    db.Profile.deleteOne({ userId: uid }),
    db.Wallet.deleteMany({ userId: uid }),
    db.PaymentMethod.deleteMany({ userId: uid }),
    db.ConsentLog.deleteMany({ userId: uid }),
    db.Notification.deleteMany({ userId: uid }),
    db.Follow.deleteMany({ $or: [{ followerId: uid }, { followingId: uid }] }),
    db.Block.deleteMany({ $or: [{ blockerId: uid }, { blockedId: uid }] }),
    db.Subscription.deleteMany({ userId: uid }),
    db.PpvPurchase.deleteMany({ userId: uid }),
    db.CreatorAccelerator.deleteMany({ creatorId: uid }),
    db.CreatorWallet.deleteMany({ creatorId: uid }),
    db.CreatorKyc.deleteMany({ creatorId: uid }),
    db.UserStreak.deleteMany({ userId: uid }),
    db.EngagementBadge.deleteMany({ userId: uid }),
    db.StreamLike.deleteMany({ userId: uid }),
    db.StreamShare.deleteMany({ userId: uid }),
    db.StreamComment.deleteMany({ userId: uid }),
    db.Referral.deleteMany({ $or: [{ referrerId: uid }, { newUserId: uid }] }),
    db.Invite.deleteMany({ inviterId: uid }),
  ]);
  await db.User.findByIdAndUpdate(uid, { $set: { email: anonymized, externalId: null, flags: { deletedAt: new Date().toISOString() } } });
  await db.DsarRequest.findByIdAndUpdate(req._id, { $set: { status: 'completed', completedAt: new Date() } });
  await db.AuditLog.create({
    action: 'dsar_delete',
    resourceType: 'User',
    resourceId: uid,
    actorId: uid,
    meta: { type: 'user_deletion', anonymized },
  });
  return { deleted: true, requestId: req._id };
}

module.exports = { exportUserData, requestDsar, deleteUserData, listDsarForUser, DELETION_GRACE_DAYS };
