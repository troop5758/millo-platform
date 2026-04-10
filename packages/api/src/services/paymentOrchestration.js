'use strict';
/**
 * Global Payment & Payout Orchestration Layer.
 * Orchestrates: viewer payments → platform wallet → creator balance → payout processor.
 * Ensures: tax compliance, currency conversion, fraud control, automated payouts, audit logging.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { writeFinancialAuditLog } = db;
const economy = require('@millo/economy');
const { approvePayout, rejectPayout } = require('@millo/billing/src/payouts');
const payoutService = require('@millo/billing/src/payoutService');
const kycService = require('./kycService');
const moderationService = require('./moderationService');
const fraudService = require('./fraudService');
const verifiedCreatorService = require('./verifiedCreatorService');
const { withWalletLock, LockContentionError } = require('../lib/walletLock');

const MIN_PAYOUT_CENTS = payoutService.MIN_PAYOUT_CENTS ?? 1000;
const VALID_PROVIDERS = ['stripe', 'paypal', 'stripe_connect', 'wise', 'bank_transfer'];

/** Config for automated payouts (env) */
const PAYOUT_AUTO_ENABLED = process.env.PAYOUT_AUTO_ENABLED === 'true';
const PAYOUT_AUTO_THRESHOLD_CENTS = Number(process.env.PAYOUT_AUTO_THRESHOLD_CENTS) || 1000;

/**
 * Request a creator payout with KYC/AML enforcement.
 * Gates: KYC approved, wallet balance, no pending request.
 * @param {Object} opts - { creatorId, amountCents, provider, destination, payoutEmail, wiseProfileId, currency }
 * @returns {{ ok: boolean, payout?: Object, error?: string }}
 */
async function requestCreatorPayout(opts) {
  const { creatorId, amountCents, provider = 'stripe', destination, payoutEmail, wiseProfileId, currency, payoutRiskTier = 'immediate', holdUntil = null } = opts || {};
  if (!creatorId || !amountCents || amountCents < MIN_PAYOUT_CENTS) {
    return { ok: false, error: 'MIN_PAYOUT', message: `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.` };
  }
  if (!VALID_PROVIDERS.includes(provider)) {
    return { ok: false, error: 'INVALID_PROVIDER', valid: VALID_PROVIDERS };
  }

  // KYC/AML gate — creators must be KYC-approved to request payouts
  const kycApproved = await kycService.isKycApproved(creatorId);
  if (!kycApproved) {
    return { ok: false, error: 'KYC_REQUIRED', message: 'KYC verification and tax form must be completed before requesting payouts.' };
  }

  // Verified creator gate — only verified creators can withdraw earnings
  const canWithdraw = await verifiedCreatorService.canWithdrawEarnings(creatorId);
  if (!canWithdraw) {
    return { ok: false, error: 'VERIFIED_CREATOR_REQUIRED', message: 'You must meet verified creator requirements (account age, followers, phone, KYC, 2FA, no violations) to withdraw earnings.' };
  }

  // Shadow-ban gate — revenue blocked for fraud-flagged users
  const shadowBanned = await moderationService.isShadowBanned(creatorId);
  if (shadowBanned) {
    return { ok: false, error: 'PAYOUT_BLOCKED', message: 'Your account is under review. Payouts are temporarily unavailable.' };
  }

  // Admin payout freeze — store/seller moderation
  const creatorWallet = await db.CreatorWallet.findOne({ creatorId }).select('payoutFrozen').lean();
  if (creatorWallet?.payoutFrozen) {
    return { ok: false, error: 'PAYOUT_FROZEN', message: 'Payouts are frozen for your account. Please contact support.' };
  }

  try {
    return await withWalletLock(creatorId, async () => {
      const wallet = await db.Wallet.findOne({ userId: creatorId });
      const heldCents = await fraudService.getHeldAmount(creatorId);
      const withdrawableCents = (wallet?.balanceCents ?? 0) - heldCents;
      if (!wallet || withdrawableCents < amountCents) {
        return { ok: false, error: 'INSUFFICIENT_BALANCE', balance: wallet?.balanceCents ?? 0, withdrawableCents: Math.max(0, withdrawableCents) };
      }

      const existing = await db.PayoutRequest.findOne({ userId: creatorId, status: 'pending' });
      if (existing) {
        return { ok: false, error: 'PENDING_REQUEST_EXISTS', requestId: String(existing._id) };
      }

      const idempotencyKey = `payout_${creatorId}_${Date.now()}`;

      wallet.balanceCents -= amountCents;
      await wallet.save();

      const payout = await db.PayoutRequest.create({
        userId: creatorId,
        amountCents,
        provider,
        idempotencyKey,
        status: 'pending',
        payoutRiskTier: payoutRiskTier === 'immediate' || payoutRiskTier === 'delay_24h' || payoutRiskTier === 'manual_review' ? payoutRiskTier : 'immediate',
        holdUntil: holdUntil || null,
        meta: { destination: destination || null, payoutEmail, wiseProfileId, currency: currency || 'USD' },
      });

      if (typeof economy.upsertFromPayoutRequest === 'function') {
        economy.upsertFromPayoutRequest(payout).catch(() => {});
      }

      if (typeof economy.isSqlEnabled === 'function' && economy.isSqlEnabled()) {
        economy.createPayoutSql({
          userId: creatorId,
          amountCents,
          currency: currency || 'USD',
          provider,
          idempotencyKey,
          status: 'pending',
          meta: { destination: destination || null, payoutEmail, wiseProfileId, mongoPayoutId: String(payout._id) },
        }).catch(() => {});
      }

      await writeFinancialAuditLog({
        action: 'PAYOUT_REQUESTED',
        walletId: wallet._id,
        amountCents,
        balanceAfterCents: wallet.balanceCents,
        refType: 'PayoutRequest',
        refId: String(payout._id),
        actorId: creatorId,
        meta: { payoutId: String(payout._id), provider, currency: currency || 'USD', fundsReserved: true },
      });

      return { ok: true, payout: payout.toObject(), newBalance: wallet.balanceCents };
    });
  } catch (e) {
    if (e instanceof LockContentionError) {
      return { ok: false, error: 'REDIS_LOCK_HELD', message: e.message };
    }
    throw e;
  }
}

/**
 * Execute payout with KYC re-check and audit.
 * Called by admin approve flow; re-validates KYC before execution.
 * @param {string} payoutId - PayoutRequest _id
 * @param {string} adminId - Admin user _id
 * @param {string} [note] - Optional override reason
 * @returns {{ ok: boolean, payout?: Object, error?: string }}
 */
async function executePayoutWithChecks(payoutId, adminId, note) {
  const payout = await db.PayoutRequest.findById(payoutId);
  if (!payout) return { ok: false, error: 'NOT_FOUND' };
  if (payout.status !== 'pending') return { ok: false, error: 'NOT_PENDING', status: payout.status };

  // KYC re-check before execution (defense in depth)
  const kycApproved = await kycService.isKycApproved(payout.userId);
  if (!kycApproved) {
    await rejectPayout(payoutId, adminId, 'KYC no longer approved at execution time.');
    return { ok: false, error: 'KYC_REVOKED', message: 'Creator KYC status changed. Payout rejected and funds returned.' };
  }

  const canWithdraw = await verifiedCreatorService.canWithdrawEarnings(payout.userId);
  if (!canWithdraw) {
    await rejectPayout(payoutId, adminId, 'Creator no longer meets verified creator requirements.');
    return { ok: false, error: 'VERIFIED_CREATOR_REQUIRED', message: 'Creator must meet verified creator requirements to withdraw. Payout rejected and funds returned.' };
  }

  // Shadow-ban re-check (defense in depth)
  const shadowBanned = await moderationService.isShadowBanned(payout.userId);
  if (shadowBanned) {
    await rejectPayout(payoutId, adminId, 'Creator shadow-banned. Payout blocked.');
    return { ok: false, error: 'PAYOUT_BLOCKED', message: 'Creator account under review. Payout rejected and funds returned.' };
  }

  try {
    const result = await approvePayout(payoutId, adminId, note);
    return { ok: true, payout: result };
  } catch (err) {
    return { ok: false, error: err.message || 'PAYOUT_FAILED' };
  }
}

/**
 * Run automated payout cycle: find KYC-approved creators above threshold, auto-approve.
 * Processes both 'pending' and 'processing' (from processPayouts scheduler).
 * Only runs if PAYOUT_AUTO_ENABLED=true. Requires SYSTEM_ADMIN_ID for audit trail.
 * @returns {{ processed: number, approved: number, failed: number, results: Array }}
 */
async function runAutomatedPayoutCycle() {
  if (!PAYOUT_AUTO_ENABLED) {
    return { processed: 0, approved: 0, failed: 0, results: [], message: 'Automated payouts disabled' };
  }

  const systemAdminId = process.env.SYSTEM_ADMIN_ID;
  if (!systemAdminId) {
    return { processed: 0, approved: 0, failed: 0, results: [], message: 'SYSTEM_ADMIN_ID required for automated payouts' };
  }

  const now = new Date();
  const pending = await db.PayoutRequest.find({
    status: { $in: ['pending', 'processing'] },
    $and: [
      { $or: [{ payoutRiskTier: { $ne: 'manual_review' } }, { payoutRiskTier: { $exists: false } }, { payoutRiskTier: null }] },
      { $or: [{ holdUntil: null }, { holdUntil: { $lte: now } }] },
    ],
  }).sort({ createdAt: 1 }).lean();
  const results = [];
  let approved = 0;
  let failed = 0;

  for (const p of pending) {
    const kycApproved = await kycService.isKycApproved(p.userId);
    if (!kycApproved) {
      await rejectPayout(p._id, systemAdminId, 'Automated cycle: KYC not approved');
      results.push({ payoutId: String(p._id), status: 'rejected', reason: 'KYC_NOT_APPROVED' });
      failed++;
      continue;
    }
    const canWithdraw = await verifiedCreatorService.canWithdrawEarnings(p.userId);
    if (!canWithdraw) {
      await rejectPayout(p._id, systemAdminId, 'Automated cycle: verified creator requirements not met');
      results.push({ payoutId: String(p._id), status: 'rejected', reason: 'VERIFIED_CREATOR_REQUIRED' });
      failed++;
      continue;
    }

    try {
      await approvePayout(p._id, systemAdminId, 'Automated payout cycle');
      results.push({ payoutId: String(p._id), status: 'approved' });
      approved++;
    } catch (err) {
      results.push({ payoutId: String(p._id), status: 'failed', error: err.message });
      failed++;
    }
  }

  return { processed: pending.length, approved, failed, results };
}

/**
 * Batch approve payouts with KYC re-check per payout.
 * @param {string[]} payoutIds - Array of PayoutRequest _id
 * @param {string} adminId - Admin user _id
 * @param {string} [note] - Optional override reason
 * @returns {{ results: Array, approved: number, failed: number }}
 */
async function executePayoutBatchWithChecks(payoutIds, adminId, note) {
  const results = [];
  let approved = 0;
  let failed = 0;
  for (const id of payoutIds) {
    const r = await executePayoutWithChecks(id, adminId, note);
    if (r.ok) {
      results.push({ payoutId: id, ok: true, payout: r.payout });
      approved++;
    } else {
      results.push({ payoutId: id, ok: false, error: r.error, message: r.message });
      failed++;
    }
  }
  return { results, approved, failed };
}

/**
 * Get creators eligible for automated payout (balance >= threshold, KYC approved, no pending).
 * Used by dashboard or external scheduler to decide when to run cycle.
 */
async function getEligibleForAutomatedPayout() {
  const creators = await db.User.find({ creatorStatus: 'approved' }).select('_id').lean();
  const eligible = [];
  for (const c of creators) {
    const kycApproved = await kycService.isKycApproved(c._id);
    if (!kycApproved) continue;
    const canWithdraw = await verifiedCreatorService.canWithdrawEarnings(c._id);
    if (!canWithdraw) continue;
    const cw = await db.CreatorWallet.findOne({ creatorId: c._id }).select('payoutFrozen').lean();
    if (cw?.payoutFrozen) continue;
    const wallet = await db.Wallet.findOne({ userId: c._id }).lean();
    const balance = wallet?.balanceCents ?? 0;
    if (balance < PAYOUT_AUTO_THRESHOLD_CENTS) continue;
    const pending = await db.PayoutRequest.findOne({ userId: c._id, status: 'pending' }).lean();
    if (pending) continue;
    eligible.push({ creatorId: c._id, balanceCents: balance });
  }
  return eligible;
}

const PAYMENT_TYPES = ['subscription', 'ppv', 'gift', 'shop_purchase', 'auction_payment', 'live_ticket'];

/**
 * Process payment: platform fee, creator payout allocation, transaction record.
 * Accepts camelCase or snake_case (user_id, creator_id, amount, platform_fee_percent).
 * @param {Object} data - { userId|user_id, creatorId|creator_id, amountCents|amount, platformFeePercent|platform_fee_percent, type, refId?, meta? }
 * @returns {Object} PaymentTransaction document
 */
async function processPayment(data) {
  const d = data || {};
  const userId = d.userId ?? d.user_id;
  const creatorId = d.creatorId ?? d.creator_id;
  const amountCents = d.amountCents ?? (d.amount != null ? Math.round(Number(d.amount) * 100) : null);
  const platformFeePercent = d.platformFeePercent ?? d.platform_fee_percent ?? 0;
  const type = d.type;
  const refId = d.refId ?? d.ref_id ?? null;
  const meta = d.meta ?? {};

  if (!creatorId || amountCents == null || amountCents < 0) {
    throw new Error('processPayment requires creatorId and amountCents >= 0');
  }

  const validType = PAYMENT_TYPES.includes(type) ? type : 'shop_purchase';
  const platformFeeCents = Math.round(amountCents * (platformFeePercent < 1 ? platformFeePercent : platformFeePercent / 100));
  const creatorAmountCents = amountCents - platformFeeCents;

  const transaction = await db.PaymentTransaction.create({
    userId: userId || undefined,
    creatorId,
    type: validType,
    grossAmountCents: amountCents,
    platformFeeCents,
    creatorAmountCents,
    status: 'completed',
    currency: 'USD',
    ...meta,
  });

  if (creatorAmountCents > 0) {
    await economy.credit(creatorId, creatorAmountCents, validType, refId || String(transaction._id), {
      ...meta,
      paymentTransactionId: String(transaction._id),
    });
  }

  return transaction;
}

/**
 * Automated Payout Scheduler — mark pending payouts as processing.
 * Run via cron every 24 hours. Picks up pending PayoutRequests and sets status to 'processing'.
 * @returns {{ processed: number, payoutIds: string[] }}
 */
async function processPayouts() {
  const now = new Date();
  const pending = await db.PayoutRequest.find({
    status: 'pending',
    $and: [
      { $or: [{ payoutRiskTier: { $ne: 'manual_review' } }, { payoutRiskTier: { $exists: false } }, { payoutRiskTier: null }] },
      { $or: [{ holdUntil: null }, { holdUntil: { $lte: now } }] },
    ],
  }).sort({ createdAt: 1 }).lean();
  const payoutIds = [];
  for (const p of pending) {
    if (p.payoutRiskTier === 'manual_review') continue;
    if (p.holdUntil && new Date(p.holdUntil) > now) continue;
    await db.PayoutRequest.updateOne({ _id: p._id }, { $set: { status: 'processing' } });
    payoutIds.push(String(p._id));
  }
  return { processed: payoutIds.length, payoutIds };
}

module.exports = {
  processPayment,
  processPayouts,
  requestCreatorPayout,
  executePayoutWithChecks,
  executePayoutBatchWithChecks,
  runAutomatedPayoutCycle,
  getEligibleForAutomatedPayout,
  MIN_PAYOUT_CENTS,
  VALID_PROVIDERS,
  PAYOUT_AUTO_ENABLED,
  PAYOUT_AUTO_THRESHOLD_CENTS,
};
