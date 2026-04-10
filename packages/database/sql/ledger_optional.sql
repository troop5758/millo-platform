-- Immutable Ledger (PostgreSQL) — OPTIONAL
-- https://milloapp.com
-- Use when ledger is backed by SQL instead of or in addition to MongoDB LedgerEntry.

-- CREATE TABLE IF NOT EXISTS ledger_entries (
--   id         BIGSERIAL PRIMARY KEY,
--   sequence   BIGINT NOT NULL UNIQUE,
--   type       VARCHAR(64) NOT NULL,
--   actor_id   VARCHAR(64),
--   amount_cents BIGINT NOT NULL,
--   balance_after_cents BIGINT,
--   ref_type   VARCHAR(64),
--   ref_id     VARCHAR(64),
--   meta       JSONB DEFAULT '{}',
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX idx_ledger_entries_sequence ON ledger_entries (sequence);
-- CREATE INDEX idx_ledger_entries_type_created ON ledger_entries (type, created_at DESC);
-- CREATE INDEX idx_ledger_entries_actor_created ON ledger_entries (actor_id, created_at DESC);
