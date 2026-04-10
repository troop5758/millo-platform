-- Optional PostgreSQL mirror for ledger analytics (not wired by default; Millo wallet uses @millo/economy / Mongo).
-- https://milloapp.com

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  type TEXT,
  amount BIGINT,
  currency TEXT,
  reference_id TEXT,
  reference_type TEXT,
  status TEXT,
  provider TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
