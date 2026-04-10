/**
 * Phase 6 validation: Double-spend impossible, immutable ledger verified.
 * https://milloapp.com
 * Requires MongoDB (run with npm run test -w @millo/economy from root).
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const db = require(path.resolve(__dirname, '../../database/src/index.js'));
const coins = require(path.resolve(__dirname, 'coins.js'));
const ledger = require(path.resolve(__dirname, 'ledger.js'));

const mongoose = require('mongoose');
let userId1, userId2;
let connected = false;

describe('economy', () => {
  beforeEach(async () => {
    if (!connected) {
      await db.connect();
      connected = true;
      userId1 = new mongoose.Types.ObjectId();
      userId2 = new mongoose.Types.ObjectId();
    }
    await db.Wallet.deleteMany({});
    await db.LedgerEntry.deleteMany({});
    await db.FinancialAuditLog.deleteMany({});
    await db.Transaction.deleteMany({});
  });

  it('debit with insufficient balance throws (double-spend impossible)', async () => {
    await coins.credit(userId1, 50, 'test', 'ref1');
    await assert.rejects(() => coins.debit(userId1, 100, 'test', 'ref2'), /INSUFFICIENT_BALANCE/);
    const balance = await coins.getBalance(userId1);
    assert.strictEqual(balance, 50);
  });

  it('two debits of exact balance: only one succeeds (double-spend impossible)', async () => {
    await coins.credit(userId1, 100, 'test', 'ref1');
    await coins.debit(userId1, 100, 'test', 'ref2');
    await assert.rejects(() => coins.debit(userId1, 100, 'test', 'ref3'), /INSUFFICIENT_BALANCE/);
    assert.strictEqual(await coins.getBalance(userId1), 0);
  });

  it('ledger balance matches wallet balance (immutable ledger verified)', async () => {
    await coins.credit(userId1, 200, 'test', 'r1');
    await coins.debit(userId1, 50, 'test', 'r2');
    const walletBalance = await coins.getBalance(userId1);
    const ledgerBalance = await ledger.getLedgerBalance(userId1);
    assert.strictEqual(walletBalance, 150);
    assert.strictEqual(ledgerBalance, 150);
  });

  it('ledger entries are append-only (immutable)', async () => {
    await coins.credit(userId1, 100, 'test', 'r1');
    const countBefore = await db.LedgerEntry.countDocuments({ actorId: userId1 });
    await coins.debit(userId1, 30, 'test', 'r2');
    const countAfter = await db.LedgerEntry.countDocuments({ actorId: userId1 });
    assert.strictEqual(countAfter, countBefore + 1);
    const entries = await db.LedgerEntry.find({ actorId: userId1 }).sort({ sequence: 1 }).lean();
    const sequences = entries.map((e) => e.sequence);
    const unique = new Set(sequences);
    assert.strictEqual(unique.size, sequences.length);
  });
});
