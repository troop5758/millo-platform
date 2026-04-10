/**
 * Enterprise provider ledger types. Runtime: `./ledger.js` (CommonJS).
 * https://milloapp.com
 */

export type LedgerEntryType = 'payment' | 'payout' | 'refund';
export type MoneyProviderId = 'stripe' | 'paypal' | 'wise';
export type LedgerStatus = 'pending' | 'completed' | 'failed';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  provider: MoneyProviderId;
  providerId: string;
  userId: string;
  /** Minor currency units (e.g. cents). */
  amount: number;
  status: LedgerStatus;
  idempotencyKey: string;
  createdAt: Date;
}

export interface PaymentProviderChargeData {
  amount?: number;
  amountCents?: number;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}

export interface PaymentProvider {
  charge(data: PaymentProviderChargeData): Promise<unknown>;
  refund(data: Record<string, unknown>): Promise<unknown>;
  payout(data: PaymentProviderChargeData): Promise<unknown>;
}

/** Existing ledger row for idempotency key, or null. */
export function ensureIdempotency(key: string): Promise<LedgerEntry | null>;

export function createLedgerEntry(
  row: Omit<LedgerEntry, 'id' | 'createdAt'> & { meta?: Record<string, unknown> }
): Promise<LedgerEntry>;

export function mapLedgerEntry(doc: Record<string, unknown> | null): LedgerEntry | null;

export function getPaymentProvider(provider: MoneyProviderId): PaymentProvider;

export function withLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
  opts?: { ttlMs?: number }
): Promise<T>;

import type { Model } from 'mongoose';

export const Ledger: Model<Record<string, unknown>>;
