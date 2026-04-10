'use strict';
/**
 * Phase 8 SQL economy storage (ACID): wallets, wallet_transactions,
 * gift_transactions, payouts, invoices.
 * https://milloapp.com
 */

let _pool = null;
let _initPromise = null;

function isSqlEnabled() {
  return process.env.FINANCIAL_SQL_ENABLED === 'true';
}

function getConnectionString() {
  return process.env.FINANCIAL_SQL_URL || process.env.SQL_DATABASE_URL || process.env.DATABASE_URL || null;
}

function getPool() {
  if (!isSqlEnabled()) return null;
  if (_pool) return _pool;
  try {
    const { Pool } = require('pg');
    const connectionString = getConnectionString();
    if (!connectionString) return null;
    _pool = new Pool({
      connectionString,
      ssl: process.env.SQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    return _pool;
  } catch {
    return null;
  }
}

async function initSchema() {
  const pool = getPool();
  if (!pool) return false;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL UNIQUE,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        balance_cents BIGINT NOT NULL DEFAULT 0,
        locked_cents BIGINT NOT NULL DEFAULT 0,
        lifetime_earnings_cents BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL,
        amount_cents BIGINT NOT NULL,
        balance_after_cents BIGINT NOT NULL,
        ref_type VARCHAR(64),
        ref_id VARCHAR(128),
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gift_transactions (
        id BIGSERIAL PRIMARY KEY,
        sender_id VARCHAR(64) NOT NULL,
        receiver_id VARCHAR(64) NOT NULL,
        stream_id VARCHAR(64),
        amount_cents BIGINT NOT NULL,
        gift_id VARCHAR(64),
        ref_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'completed',
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS payouts (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        amount_cents BIGINT NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        provider VARCHAR(32) NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL UNIQUE,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        external_id VARCHAR(128),
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id BIGSERIAL PRIMARY KEY,
        invoice_id VARCHAR(128) NOT NULL UNIQUE,
        user_id VARCHAR(64) NOT NULL,
        creator_id VARCHAR(64),
        amount_cents BIGINT NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        tax_amount_cents BIGINT NOT NULL DEFAULT 0,
        tax_region VARCHAR(16),
        vat_rate NUMERIC(10,4) DEFAULT 0,
        ref_type VARCHAR(64),
        ref_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'issued',
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gift_transactions_sender_created ON gift_transactions (sender_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gift_transactions_receiver_created ON gift_transactions (receiver_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_payouts_user_created ON payouts (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices (user_id, created_at DESC);
    `);
    return true;
  })().catch(() => false);
  return _initPromise;
}

async function getOrCreateWalletSql(userId, currency = 'USD') {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const uid = String(userId);
  await pool.query(
    `INSERT INTO wallets (user_id, currency) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [uid, currency]
  );
  const r = await pool.query(`SELECT * FROM wallets WHERE user_id = $1`, [uid]);
  return r.rows[0] || null;
}

async function getBalanceSql(userId) {
  const w = await getOrCreateWalletSql(userId);
  if (!w) return null;
  return Number(w.balance_cents || 0);
}

async function creditWalletSql(userId, amountCents, opts = {}) {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const uid = String(userId);
    await client.query(
      `INSERT INTO wallets (user_id, currency) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [uid, opts.currency || 'USD']
    );
    const lock = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [uid]);
    const row = lock.rows[0];
    if (!row) throw new Error('WALLET_NOT_FOUND');
    const nextBalance = Number(row.balance_cents || 0) + Number(amountCents || 0);
    const nextLifetime = Number(row.lifetime_earnings_cents || 0) + Number(opts.lifetimeEarningsDelta || 0);
    await client.query(
      `UPDATE wallets
       SET balance_cents = $2, lifetime_earnings_cents = $3, updated_at = NOW()
       WHERE user_id = $1`,
      [uid, nextBalance, nextLifetime]
    );
    const tx = await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount_cents, balance_after_cents, ref_type, ref_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [
        uid,
        'credit',
        Number(amountCents || 0),
        nextBalance,
        opts.refType || null,
        opts.refId || null,
        JSON.stringify(opts.meta || {}),
      ]
    );
    await client.query('COMMIT');
    return { balanceCents: nextBalance, walletTransactionId: tx.rows[0]?.id || null };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function debitWalletSql(userId, amountCents, opts = {}) {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const uid = String(userId);
    await client.query(
      `INSERT INTO wallets (user_id, currency) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [uid, opts.currency || 'USD']
    );
    const lock = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [uid]);
    const row = lock.rows[0];
    if (!row) throw new Error('WALLET_NOT_FOUND');
    const current = Number(row.balance_cents || 0);
    if (current < Number(amountCents || 0)) throw new Error('INSUFFICIENT_BALANCE');
    const nextBalance = current - Number(amountCents || 0);
    await client.query(
      `UPDATE wallets SET balance_cents = $2, updated_at = NOW() WHERE user_id = $1`,
      [uid, nextBalance]
    );
    const tx = await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount_cents, balance_after_cents, ref_type, ref_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [
        uid,
        'debit',
        -Number(amountCents || 0),
        nextBalance,
        opts.refType || null,
        opts.refId || null,
        JSON.stringify(opts.meta || {}),
      ]
    );
    await client.query('COMMIT');
    return { balanceCents: nextBalance, walletTransactionId: tx.rows[0]?.id || null };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function insertGiftTransactionSql(opts = {}) {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const res = await pool.query(
    `INSERT INTO gift_transactions (sender_id, receiver_id, stream_id, amount_cents, gift_id, ref_id, status, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id`,
    [
      String(opts.senderId),
      String(opts.receiverId),
      opts.streamId ? String(opts.streamId) : null,
      Number(opts.amountCents || 0),
      opts.giftId || null,
      opts.refId || null,
      opts.status || 'completed',
      JSON.stringify(opts.meta || {}),
    ]
  );
  return res.rows[0]?.id || null;
}

async function createPayoutSql(opts = {}) {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const res = await pool.query(
    `INSERT INTO payouts (user_id, amount_cents, currency, provider, idempotency_key, status, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [
      String(opts.userId),
      Number(opts.amountCents || 0),
      opts.currency || 'USD',
      opts.provider || 'stripe',
      String(opts.idempotencyKey),
      opts.status || 'pending',
      JSON.stringify(opts.meta || {}),
    ]
  );
  return res.rows[0]?.id || null;
}

async function createInvoiceSql(opts = {}) {
  const pool = getPool();
  if (!pool) return null;
  await initSchema();
  const res = await pool.query(
    `INSERT INTO invoices
      (invoice_id, user_id, creator_id, amount_cents, currency, tax_amount_cents, tax_region, vat_rate, ref_type, ref_id, status, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (invoice_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [
      String(opts.invoiceId),
      String(opts.userId),
      opts.creatorId ? String(opts.creatorId) : null,
      Number(opts.amountCents || 0),
      opts.currency || 'USD',
      Number(opts.taxAmountCents || 0),
      opts.taxRegion || null,
      Number(opts.vatRate || 0),
      opts.refType || null,
      opts.refId || null,
      opts.status || 'issued',
      JSON.stringify(opts.meta || {}),
    ]
  );
  return res.rows[0]?.id || null;
}

module.exports = {
  isSqlEnabled,
  initSchema,
  getOrCreateWalletSql,
  getBalanceSql,
  creditWalletSql,
  debitWalletSql,
  insertGiftTransactionSql,
  createPayoutSql,
  createInvoiceSql,
};

