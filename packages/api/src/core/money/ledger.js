'use strict';
/**
 * Enterprise money ledger — provider rows, idempotency, locks, payment adapters.
 * Mongo model: MoneyProviderLedgerEntry (exported as `Ledger`). FinancialAuditLog on writes.
 * https://milloapp.com
 */

const db = require('@millo/database');
const billingStripe = require('@millo/billing/src/stripe');
const billingPaypal = require('@millo/billing/src/paypal');
const { withLock } = require('./lock');

/** @type {typeof db.MoneyProviderLedgerEntry} */
const Ledger = db.MoneyProviderLedgerEntry;

/**
 * Normalize idempotency key (shared style with billing idempotency).
 * @param {string} key
 */
function normalizeIdempotencyKey(key) {
  if (key == null || !String(key).trim()) {
    const err = new Error('IDEMPOTENCY_KEY_REQUIRED');
    err.code = 'IDEMPOTENCY_KEY_REQUIRED';
    throw err;
  }
  return String(key).trim().slice(0, 512);
}

/**
 * If a ledger row already exists for this idempotency key, return it (plain object); else null.
 * @param {string} key
 * @returns {Promise<import('./ledger').LedgerEntry | null>}
 */
async function ensureIdempotency(key) {
  const k = normalizeIdempotencyKey(key);
  const exists = await Ledger.findOne({ idempotencyKey: k }).lean();
  if (exists) return mapLedgerEntry(exists);
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} doc
 * @returns {import('./ledger').LedgerEntry | null}
 */
function mapLedgerEntry(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    type: doc.type,
    provider: doc.provider,
    providerId: doc.providerId,
    userId: String(doc.userId),
    amount: Number(doc.amount),
    status: doc.status,
    idempotencyKey: doc.idempotencyKey,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
  };
}

/**
 * Create a provider ledger row under per-user lock. Duplicate idempotencyKey returns existing mapped row.
 * Writes FinancialAuditLog for the append.
 * @param {Omit<import('./ledger').LedgerEntry, 'id' | 'createdAt'> & { meta?: Record<string, unknown> }} row
 * @returns {Promise<import('./ledger').LedgerEntry>}
 */
async function createLedgerEntry(row) {
  const userId = String(row.userId);
  const idemKey = normalizeIdempotencyKey(row.idempotencyKey);

  return withLock(`ledger:${userId}`, async () => {
    const prior = await Ledger.findOne({ idempotencyKey: idemKey }).lean();
    if (prior) return mapLedgerEntry(prior);

    const doc = await Ledger.create({
      type: row.type,
      provider: row.provider,
      providerId: row.providerId,
      userId: row.userId,
      amount: row.amount,
      status: row.status || 'pending',
      idempotencyKey: idemKey,
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    });

    await db.writeFinancialAuditLog({
      action: `money_ledger_${row.type}`,
      amountCents: row.amount,
      refType: row.provider,
      refId: row.providerId,
      actorId: row.userId,
      meta: {
        idempotencyKey: idemKey,
        moneyLedgerId: String(doc._id),
        status: doc.status,
      },
    });

    return mapLedgerEntry(doc.toObject());
  });
}

/**
 * @param {'stripe'|'paypal'|'wise'} provider
 * @returns {import('./ledger').PaymentProvider}
 */
function getPaymentProvider(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'stripe') {
    return {
      async charge(data) {
        const amountCents = Number(data?.amount ?? data?.amountCents);
        const idempotencyKey = data?.idempotencyKey;
        const meta = data?.meta || {};
        return billingStripe.createCharge(amountCents, idempotencyKey, meta);
      },
      async refund() {
        const err = new Error('STRIPE_REFUND_NOT_IMPLEMENTED');
        err.code = 'NOT_IMPLEMENTED';
        throw err;
      },
      async payout(data) {
        const amountCents = Number(data?.amount ?? data?.amountCents);
        const idempotencyKey = data?.idempotencyKey;
        const meta = data?.meta || {};
        return billingStripe.createPayout(amountCents, idempotencyKey, meta);
      },
    };
  }
  if (p === 'paypal') {
    return {
      async charge() {
        const err = new Error('PAYPAL_CHARGE_NOT_IMPLEMENTED');
        err.code = 'NOT_IMPLEMENTED';
        throw err;
      },
      async refund() {
        const err = new Error('PAYPAL_REFUND_NOT_IMPLEMENTED');
        err.code = 'NOT_IMPLEMENTED';
        throw err;
      },
      async payout(data) {
        const amountCents = Number(data?.amount ?? data?.amountCents);
        const idempotencyKey = data?.idempotencyKey;
        const meta = data?.meta || {};
        return billingPaypal.createPayout(amountCents, idempotencyKey, meta);
      },
    };
  }
  if (p === 'wise') {
    const errFn = async () => {
      const err = new Error('WISE_NOT_CONFIGURED');
      err.code = 'WISE_NOT_CONFIGURED';
      throw err;
    };
    return { charge: errFn, refund: errFn, payout: errFn };
  }
  const err = new Error('UNKNOWN_PAYMENT_PROVIDER');
  err.code = 'UNKNOWN_PAYMENT_PROVIDER';
  throw err;
}

module.exports = {
  Ledger,
  ensureIdempotency,
  createLedgerEntry,
  mapLedgerEntry,
  getPaymentProvider,
  withLock,
};
