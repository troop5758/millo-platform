/**
 * Unified support ticket contract. Persistence: `@millo/database` SupportTicket schema.
 * https://milloapp.com
 */

import type { Types } from 'mongoose';

export type SupportCoreLinkage = 'userId' | 'orderId' | 'paymentId';

export const CORE_LINKAGE_FIELDS: readonly SupportCoreLinkage[];

export const UNIFIED_MODEL: 'SupportTicket';

export function getCoreLinkageFields(): readonly string[];

/** Embedded message subdocument (see SupportTicket schema). */
export interface SupportTicketMessageEmbedded {
  userId: Types.ObjectId;
  senderId?: Types.ObjectId;
  fromRole: 'user' | 'support' | 'admin' | 'system';
  senderRole?: 'user' | 'support' | 'admin';
  body: string;
  message?: string;
  attachments?: string[];
  seen?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Unified model shape (subset; full schema has status, SLA, etc.). */
export interface SupportTicketUnified {
  userId: Types.ObjectId;
  orderId?: Types.ObjectId | null;
  paymentId?: Types.ObjectId | null;
  messages: SupportTicketMessageEmbedded[];
}
