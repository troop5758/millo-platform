/**
 * ledger.service.js — universal payment resolution order (Vitest + mocks).
 * https://milloapp.com
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const mockFindByRef = vi.fn();
const mockLedgerFindOne = vi.fn();
const mockOrderFindOne = vi.fn();
const mockPayoutFindOne = vi.fn();
const mockChargebackFindOne = vi.fn();
const mockPaymentTxLean = vi.fn();
const mockDisputeFindOne = vi.fn();
const mockPpvFindOne = vi.fn();
const mockIdemLean = vi.fn();
const mockMoneyIndexLean = vi.fn();

vi.mock('@millo/database', () => ({
  MoneyIndex: {
    findOne: () => ({ sort: () => ({ lean: mockMoneyIndexLean }) }),
  },
  LedgerEntry: {
    findOne: (filter) => mockLedgerFindOne(filter),
  },
  Order: {
    findOne: (filter) => mockOrderFindOne(filter),
  },
  PayoutRequest: {
    findOne: (filter) => mockPayoutFindOne(filter),
  },
  Chargeback: {
    findOne: (filter) => mockChargebackFindOne(filter),
  },
  PaymentTransaction: {
    findOne: () => ({ lean: mockPaymentTxLean }),
  },
  Dispute: {
    findOne: (filter) => mockDisputeFindOne(filter),
  },
  PpvPurchase: {
    findOne: (filter) => mockPpvFindOne(filter),
  },
  IdempotencyRecord: {
    findOne: () => ({ lean: mockIdemLean }),
  },
}));

vi.mock('../services/paymentReferenceService', () => ({
  findByReference: (id) => mockFindByRef(id),
}));

const ledger = require('../services/ledger.service.js');

function emptyPayoutLean() {
  return { sort: () => ({ lean: async () => null }) };
}

function emptyChargebackLean() {
  return { sort: () => ({ lean: async () => null }) };
}

function emptyDisputeLean() {
  return { sort: () => ({ lean: async () => null }) };
}

function emptyPpvLean() {
  return { sort: () => ({ lean: async () => null }) };
}

describe('findUniversalPaymentById', () => {
  beforeEach(() => {
    mockFindByRef.mockReset();
    mockLedgerFindOne.mockReset();
    mockOrderFindOne.mockReset();
    mockPayoutFindOne.mockReset();
    mockChargebackFindOne.mockReset();
    mockPaymentTxLean.mockReset();
    mockDisputeFindOne.mockReset();
    mockPpvFindOne.mockReset();
    mockIdemLean.mockReset();
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    mockChargebackFindOne.mockReturnValue(emptyChargebackLean());
    mockPaymentTxLean.mockResolvedValue(null);
    mockDisputeFindOne.mockReturnValue(emptyDisputeLean());
    mockPpvFindOne.mockReturnValue(emptyPpvLean());
    mockIdemLean.mockResolvedValue(null);
    mockMoneyIndexLean.mockResolvedValue(null);
  });

  it('returns money_index when MoneyIndex matches providerId first', async () => {
    const mi = {
      _id: '507f1f77bcf86cd799439088',
      refId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      type: 'payment',
      provider: 'stripe',
      providerId: 'cs_indexed',
      userId: 'u_mi',
      amountCents: 1200,
      currency: 'USD',
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockMoneyIndexLean.mockResolvedValue(mi);
    const hit = await ledger.findUniversalPaymentById('cs_indexed');
    expect(hit).toEqual({ kind: 'money_index', doc: mi });
    expect(mockFindByRef).not.toHaveBeenCalled();
  });

  it('returns payment_reference when PaymentReference matches', async () => {
    const doc = { _id: 'pr1', referenceId: 'cs_abc', provider: 'stripe', status: 'completed', userId: 'u1', amountCents: 500 };
    mockFindByRef.mockResolvedValue(doc);
    const hit = await ledger.findUniversalPaymentById('cs_abc');
    expect(hit).toEqual({ kind: 'payment_reference', doc });
    expect(mockLedgerFindOne).not.toHaveBeenCalled();
  });

  it('falls through to LedgerEntry when no PaymentReference', async () => {
    mockFindByRef.mockResolvedValue(null);
    const le = { _id: '507f1f77bcf86cd799439011', refId: 'pi_xyz', actorId: 'u2', amountCents: 100, meta: {} };
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => le }) });
    const hit = await ledger.findUniversalPaymentById('pi_xyz');
    expect(hit).toEqual({ kind: 'ledger_entry', doc: le });
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });

  it('falls through to Order when no PR or ledger', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    const ord = {
      _id: '507f1f77bcf86cd799439012',
      userId: 'u3',
      totalCents: 999,
      status: 'paid',
      stripeSessionId: 'cs_sess',
    };
    mockOrderFindOne.mockResolvedValue(ord);
    const hit = await ledger.findUniversalPaymentById('cs_sess');
    expect(hit).toEqual({ kind: 'order', doc: ord });
  });

  it('resolves order: prefix to Order _id', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    const oid = '507f1f77bcf86cd799439099';
    const ord = { _id: oid, userId: 'u4', totalCents: 100, status: 'pending' };
    mockOrderFindOne.mockResolvedValue(ord);
    const hit = await ledger.findUniversalPaymentById(`order:${oid}`);
    expect(hit).toEqual({ kind: 'order', doc: ord });
  });

  it('resolves PayoutRequest by externalId when earlier tables miss', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    const payout = {
      _id: '507f1f77bcf86cd7994390aa',
      userId: 'creator1',
      amountCents: 5000,
      currency: 'USD',
      provider: 'wise',
      idempotencyKey: 'idem_wise_1',
      status: 'paid',
      externalId: 'wise-transfer-999',
    };
    mockPayoutFindOne.mockReturnValue({ sort: () => ({ lean: async () => payout }) });
    const hit = await ledger.findUniversalPaymentById('wise-transfer-999');
    expect(hit).toEqual({ kind: 'payout_request', doc: payout });
  });

  it('resolves PayoutRequest by Mongo _id', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    const id = '507f1f77bcf86cd7994390bb';
    const payout = {
      _id: id,
      userId: 'creator2',
      amountCents: 1000,
      provider: 'paypal',
      idempotencyKey: 'idem_pp',
      status: 'pending',
    };
    mockPayoutFindOne.mockReturnValue({ sort: () => ({ lean: async () => payout }) });
    const hit = await ledger.findUniversalPaymentById(id);
    expect(hit).toEqual({ kind: 'payout_request', doc: payout });
  });

  it('resolves Chargeback by stripeDisputeId when earlier tables miss', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    const cb = {
      _id: '507f1f77bcf86cd7994390dd',
      stripeDisputeId: 'dp_test_123',
      stripeChargeId: 'ch_abc',
      amountCents: 2500,
      currency: 'usd',
      status: 'open',
      userId: 'u9',
    };
    mockChargebackFindOne.mockReturnValue({ sort: () => ({ lean: async () => cb }) });
    const hit = await ledger.findUniversalPaymentById('dp_test_123');
    expect(hit).toEqual({ kind: 'chargeback', doc: cb });
  });

  it('resolves PaymentTransaction by Mongo _id when earlier tables miss', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    mockChargebackFindOne.mockReturnValue(emptyChargebackLean());
    const tid = '507f1f77bcf86cd7994390ee';
    const tx = {
      _id: tid,
      userId: 'buyer1',
      type: 'gift',
      grossAmountCents: 300,
      status: 'completed',
      paymentProcessor: 'stripe',
    };
    mockPaymentTxLean.mockResolvedValue(tx);
    const hit = await ledger.findUniversalPaymentById(tid);
    expect(hit).toEqual({ kind: 'payment_transaction', doc: tx });
  });

  it('resolves Dispute by Mongo _id after PaymentTransaction misses', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    mockChargebackFindOne.mockReturnValue(emptyChargebackLean());
    mockPaymentTxLean.mockResolvedValue(null);
    const did = '507f1f77bcf86cd7994390f2';
    const dp = {
      _id: did,
      userId: 'u_dis',
      transactionId: '507f1f77bcf86cd7994390f3',
      status: 'open',
      meta: {},
    };
    mockDisputeFindOne.mockReturnValue({ sort: () => ({ lean: async () => dp }) });
    const hit = await ledger.findUniversalPaymentById(did);
    expect(hit).toEqual({ kind: 'dispute', doc: dp });
  });

  it('resolves PpvPurchase by meta.paymentIntentId when earlier tables miss', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    mockChargebackFindOne.mockReturnValue(emptyChargebackLean());
    const ppv = {
      _id: '507f1f77bcf86cd7994390f4',
      userId: 'fan1',
      streamId: '507f1f77bcf86cd7994390f5',
      creatorId: '507f1f77bcf86cd7994390f6',
      amountCents: 499,
      meta: { paymentIntentId: 'pi_ppv_1' },
    };
    mockPpvFindOne.mockReturnValue({ sort: () => ({ lean: async () => ppv }) });
    const hit = await ledger.findUniversalPaymentById('pi_ppv_1');
    expect(hit).toEqual({ kind: 'ppv_purchase', doc: ppv });
  });

  it('resolves IdempotencyRecord by key when earlier tables miss', async () => {
    mockFindByRef.mockResolvedValue(null);
    mockLedgerFindOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockOrderFindOne.mockResolvedValue(null);
    mockPayoutFindOne.mockReturnValue(emptyPayoutLean());
    mockChargebackFindOne.mockReturnValue(emptyChargebackLean());
    const rec = { _id: '507f1f77bcf86cd7994390f7', key: 'idem:checkout:abc', status: 'completed', result: { ok: true } };
    mockIdemLean.mockResolvedValue(rec);
    const hit = await ledger.findUniversalPaymentById('idem:checkout:abc');
    expect(hit).toEqual({ kind: 'idempotency_record', doc: rec });
  });
});

describe('toUniversalPayment / ownerUserIdFromHit', () => {
  it('maps payment_reference to DTO', () => {
    const hit = {
      kind: 'payment_reference',
      doc: {
        _id: 'a',
        referenceId: 'cs_1',
        provider: 'stripe',
        status: 'pending',
        userId: 'u1',
        amountCents: 200,
        currency: 'USD',
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('payment_reference');
    expect(dto.status).toBe('pending');
    expect(dto.providerId).toBe('cs_1');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('u1');
  });

  it('maps ledger_entry to DTO', () => {
    const hit = {
      kind: 'ledger_entry',
      doc: {
        _id: '507f1f77bcf86cd799439011',
        refId: 'pi_99',
        actorId: 'u2',
        amountCents: -50,
        meta: {},
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('ledger_entry');
    expect(dto.provider).toBe('ledger');
    expect(dto.status).toBe('completed');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('u2');
  });

  it('maps payout_request to DTO', () => {
    const hit = {
      kind: 'payout_request',
      doc: {
        _id: '507f1f77bcf86cd7994390cc',
        userId: 'c1',
        amountCents: 2500,
        currency: 'EUR',
        provider: 'wise',
        externalId: 'w-ext',
        idempotencyKey: 'ik1',
        status: 'paid',
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('payout_request');
    expect(dto.provider).toBe('wise');
    expect(dto.providerId).toBe('w-ext');
    expect(dto.status).toBe('completed');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('c1');
  });

  it('maps chargeback to DTO', () => {
    const hit = {
      kind: 'chargeback',
      doc: {
        _id: '507f1f77bcf86cd7994390ff',
        stripeDisputeId: 'dp_x',
        amountCents: 100,
        currency: 'usd',
        status: 'lost',
        userId: 'u8',
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('chargeback');
    expect(dto.provider).toBe('stripe');
    expect(dto.status).toBe('failed');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('u8');
  });

  it('maps payment_transaction to DTO', () => {
    const hit = {
      kind: 'payment_transaction',
      doc: {
        _id: '507f1f77bcf86cd7994390f1',
        userId: 'ub',
        type: 'shop_purchase',
        grossAmountCents: 1200,
        status: 'refunded',
        paymentProcessor: 'stripe',
        currency: 'USD',
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('payment_transaction');
    expect(dto.transactionType).toBe('shop_purchase');
    expect(dto.status).toBe('refunded');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('ub');
  });

  it('maps dispute to DTO', () => {
    const hit = {
      kind: 'dispute',
      doc: {
        _id: '507f1f77bcf86cd7994390d1',
        userId: 'ud',
        transactionId: '507f1f77bcf86cd7994390d2',
        status: 'investigating',
        meta: { amountCents: 100 },
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('dispute');
    expect(dto.status).toBe('pending');
    expect(dto.refId).toBe('507f1f77bcf86cd7994390d2');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('ud');
  });

  it('maps ppv_purchase to DTO', () => {
    const hit = {
      kind: 'ppv_purchase',
      doc: {
        _id: '507f1f77bcf86cd7994390d3',
        userId: 'uf',
        amountCents: 999,
        meta: { paymentIntentId: 'pi_x' },
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('ppv_purchase');
    expect(dto.providerId).toBe('pi_x');
    expect(dto.status).toBe('completed');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('uf');
  });

  it('maps money_index to DTO', () => {
    const hit = {
      kind: 'money_index',
      doc: {
        _id: '507f1f77bcf86cd7994390e0',
        refId: 'uuid-1',
        type: 'payment',
        provider: 'stripe',
        providerId: 'pi_1',
        userId: 'um',
        amountCents: 50,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('money_index');
    expect(dto.refId).toBe('uuid-1');
    expect(dto.moneyType).toBe('payment');
    expect(ledger.ownerUserIdFromHit(hit)).toBe('um');
  });

  it('maps idempotency_record to DTO', () => {
    const hit = {
      kind: 'idempotency_record',
      doc: {
        _id: '507f1f77bcf86cd7994390d4',
        key: 'k1',
        status: 'failed',
      },
    };
    const dto = ledger.toUniversalPayment(hit);
    expect(dto.source).toBe('idempotency_record');
    expect(dto.providerId).toBe('k1');
    expect(dto.status).toBe('failed');
    expect(ledger.ownerUserIdFromHit(hit)).toBe(null);
  });
});
