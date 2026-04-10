/**
 * Admin dashboard — financial ops, kill-switch, ledger view, economy control.
 * All overrides logged to AdminAuditLog. https://milloapp.com
 */
const db = require('@millo/database');
const { writeAdminAuditLog } = db;
const economy = require('@millo/economy');
const roles = require('./roles');
const featureToggleStore = require('./featureToggleStore');

async function financialOps(adminUser, action, payload) {
  roles.requireAdmin(adminUser);
  const adminId = adminUser._id || adminUser;
  if (action === 'credit') {
    await economy.credit(payload.userId, payload.amountCents, 'admin_override', payload.refId || null, { adminId: adminId?.toString() });
    await writeAdminAuditLog({
      action: 'financial_ops_credit',
      adminId,
      targetType: 'Wallet',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: { amountCents: payload.amountCents },
    });
    return { ok: true };
  }
  if (action === 'debit') {
    await economy.debit(payload.userId, payload.amountCents, 'admin_override', payload.refId || null, { adminId: adminId?.toString() });
    await writeAdminAuditLog({
      action: 'financial_ops_debit',
      adminId,
      targetType: 'Wallet',
      targetId: payload.userId?.toString(),
      overrideReason: payload.reason || null,
      meta: { amountCents: payload.amountCents },
    });
    return { ok: true };
  }
  throw new Error('UNKNOWN_ACTION');
}

async function killSwitch(adminUser, which, enabled) {
  roles.requireFeatureToggleAccess(adminUser);
  const adminId = adminUser._id || adminUser;
  await featureToggleStore.setToggle(which, !!enabled, adminId);
  const norm = featureToggleStore.normalizeWhich(which);
  await writeAdminAuditLog({
    action: 'feature_toggle',
    adminId,
    targetType: 'config',
    targetId: norm || String(which),
    overrideReason: null,
    meta: { enabled: !!enabled, which: norm || which },
  });
  return { ok: true, which: norm || which, enabled: !!enabled };
}

async function ledgerView(adminUser, userId, limit = 50) {
  roles.requireAdmin(adminUser);
  const entries = await db.LedgerEntry.find({ actorId: userId }).sort({ sequence: -1 }).limit(limit).lean();
  return entries;
}

async function economyControl(adminUser, action, payload) {
  roles.requireAdmin(adminUser);
  if (action === 'getBalance') {
    const balance = await economy.getBalance(payload.userId);
    return { balanceCents: balance };
  }
  await financialOps(adminUser, action, payload);
  return { ok: true };
}

/**
 * Financial viewer — balance, ledger entries, financial audit logs for a user (read-only).
 * Depends on Phase 6 (ledger), Phase 9 (billing audit trail).
 */
async function getFinancialView(adminUser, userId, opts = {}) {
  roles.requireAdmin(adminUser);
  const ledgerLimit = Math.min(Number(opts.ledgerLimit) || 50, 200);
  const auditLimit = Math.min(Number(opts.auditLimit) || 50, 200);
  const balanceCents = await economy.getBalance(userId);
  const ledgerEntries = await db.LedgerEntry.find({ actorId: userId })
    .sort({ sequence: -1 })
    .limit(ledgerLimit)
    .lean();
  const wallet = await db.Wallet.findOne({ userId }).lean();
  const financialAuditLogs = wallet
    ? await db.FinancialAuditLog.find({ walletId: wallet._id })
        .sort({ createdAt: -1 })
        .limit(auditLimit)
        .lean()
    : [];
  return { balanceCents, ledgerEntries, financialAuditLogs };
}

/**
 * Fraud alerts for admin dashboard — gift velocity, device farm, payment risk, bot viewer.
 * Returns unified list from FraudEvent + DeviceFingerprint (device farm).
 */
async function getFraudAlerts(adminUser, opts = {}) {
  roles.requireAdmin(adminUser);
  const limit = Math.min(Number(opts.limit) || 100, 200);
  const eventTypes = opts.eventType ? [opts.eventType] : null;

  const query = {
    $or: [
      { action: { $in: ['review', 'block'] } },
      { eventType: 'viewer_spike' },
    ],
  };
  if (eventTypes?.length) query.eventType = { $in: eventTypes };

  const events = await db.FraudEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const alerts = events.map((e) => {
    let alertType = 'payment_risk';
    if (e.eventType === 'gift') alertType = 'gift_velocity';
    else if (e.eventType === 'viewer_spike') alertType = 'bot_viewer';
    else if (e.eventType === 'payment' || e.eventType === 'ppv_unlock' || e.eventType === 'order')
      alertType = 'payment_risk';
    else if (e.signals?.some((s) => ['multiple_accounts', 'device_count_high'].includes(s)))
      alertType = 'device_farm';

    return {
      id: e._id.toString(),
      alertType,
      eventType: e.eventType,
      action: e.action,
      userId: e.userId?.toString(),
      riskScore: e.riskScore,
      signals: e.signals || [],
      refType: e.refType,
      refId: e.refId,
      meta: e.meta || {},
      createdAt: e.createdAt,
    };
  });

  const deviceFarmAlerts = await db.DeviceFingerprint.aggregate([
    { $group: { _id: '$fingerprint', userIds: { $addToSet: '$userId' }, count: { $sum: 1 }, lastSeen: { $max: '$lastSeenAt' } } },
    { $match: { count: { $gte: 5 } } },
    { $limit: 20 },
  ]).exec();

  for (const df of deviceFarmAlerts) {
    alerts.push({
      id: `device_farm_${String(df._id).slice(0, 12)}`,
      alertType: 'device_farm',
      eventType: 'device_fingerprint',
      action: 'review',
      userId: null,
      riskScore: 80,
      signals: ['multiple_accounts'],
      meta: { fingerprint: df._id, accountCount: df.count, userIds: (df.userIds || []).map((u) => u?.toString()).filter(Boolean) },
      createdAt: df.lastSeen || new Date(),
    });
  }

  alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return alerts.slice(0, limit);
}

module.exports = { financialOps, killSwitch, ledgerView, economyControl, getFinancialView, getFraudAlerts };
