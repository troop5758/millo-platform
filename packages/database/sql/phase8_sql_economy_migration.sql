-- Phase 8 SQL Economy Migration (ACID)
-- Move financial systems from Mongo to SQL-primary tables.
-- https://milloapp.com

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
  type VARCHAR(32) NOT NULL, -- credit | debit
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

