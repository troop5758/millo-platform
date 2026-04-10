-- Optional SQL schema: wallets, gift_transactions, payouts
-- https://milloapp.com
-- Use when backing economy in PostgreSQL (dual-write or migration from MongoDB).

-- ========== wallets ==========
CREATE TABLE IF NOT EXISTS wallets (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               VARCHAR(64) NOT NULL UNIQUE,
  currency              VARCHAR(8) NOT NULL DEFAULT 'USD',
  balance_cents         BIGINT NOT NULL DEFAULT 0,
  locked_cents          BIGINT NOT NULL DEFAULT 0,
  lifetime_earnings_cents BIGINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_currency ON wallets (currency);

-- ========== gift_transactions ==========
CREATE TABLE IF NOT EXISTS gift_transactions (
  id          BIGSERIAL PRIMARY KEY,
  sender_id   VARCHAR(64) NOT NULL,
  receiver_id VARCHAR(64) NOT NULL,
  stream_id   VARCHAR(64),
  amount_cents BIGINT NOT NULL,
  gift_id     VARCHAR(64),
  ref_id      VARCHAR(64),
  status      VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_transactions_sender_created ON gift_transactions (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_receiver_created ON gift_transactions (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_stream_created ON gift_transactions (stream_id, created_at DESC) WHERE stream_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gift_transactions_ref_id ON gift_transactions (ref_id) WHERE ref_id IS NOT NULL;

-- ========== payouts ==========
CREATE TABLE IF NOT EXISTS payouts (
  id                BIGSERIAL PRIMARY KEY,
  user_id           VARCHAR(64) NOT NULL,
  amount_cents      BIGINT NOT NULL,
  currency          VARCHAR(8) NOT NULL DEFAULT 'USD',
  provider          VARCHAR(32) NOT NULL,
  idempotency_key   VARCHAR(128) NOT NULL UNIQUE,
  status            VARCHAR(32) NOT NULL DEFAULT 'pending',
  approved_by       VARCHAR(64),
  approved_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  external_id       VARCHAR(128),
  meta              JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_idempotency_key ON payouts (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payouts_status_created ON payouts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_user_created ON payouts (user_id, created_at DESC);
