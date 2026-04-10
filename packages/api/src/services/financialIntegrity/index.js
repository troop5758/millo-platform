'use strict';
/**
 * Financial Integrity Layer — universal MoneyIndex (see @millo/database MoneyIndex),
 * idempotency (@millo/billing), Redis locks (ledger.service), provider adapter isLive(),
 * and fail-closed merchant gates.
 *
 * Canonical ledger row shape is MoneyIndex: refId, type, provider, providerId, userId,
 * amountCents, status, idempotencyKey (optional), sourceKind/sourceId.
 * Use @millo/economy upsertMoneyIndexRow / upsertFrom* helpers for write-through.
 *
 * https://milloapp.com
 */

const { FinancialIntegrityError } = require('./errors');
const { assertMerchantPaymentsLive, assertProviderAdapterLive } = require('./failClosed');
const { withMoneyUserLock, withMoneyLock } = require('./moneyLock');
const { executeMoneyOperation } = require('./operation');

/** Doc-only mirror of the MoneyIndex / enterprise ledger contract. */
const MoneyLedger = Object.freeze({
  id: 'refId (UUID) + Mongo _id',
  type: 'payment | payout | refund | adjustment | chargeback',
  provider: 'stripe | paypal | wise | coin | internal',
  providerId: 'processor reference',
  userId: 'ObjectId',
  amount: 'amountCents + currency on document',
  status: 'pending | completed | failed | ...',
  idempotencyKey: 'optional sparse-unique on MoneyIndex',
});

module.exports = {
  MoneyLedger,
  FinancialIntegrityError,
  assertMerchantPaymentsLive,
  assertProviderAdapterLive,
  withMoneyUserLock,
  withMoneyLock,
  executeMoneyOperation,
};
