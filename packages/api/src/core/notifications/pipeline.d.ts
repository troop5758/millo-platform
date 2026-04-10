/**
 * Notification pipeline — https://milloapp.com
 */

import type { Job } from 'bullmq';

export type NotificationPipelineType = 'email' | 'push' | 'in_app' | 'sms';

/** Delivery log / queue payload (extends NotificationLog fields). */
export interface NotificationPipelineMessage {
  userId: string;
  type?: NotificationPipelineType;
  provider?: string;
  error?: string;
  templateKey?: string;
  to?: string;
  subject?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  template?: string;
  ctaUrl?: string;
  ctaText?: string;
  inAppType?: string;
  meta?: Record<string, unknown>;
}

export const QUEUE_NAME: string;

export function shouldEnqueueNotificationPipeline(): boolean;

export function getNotificationPipelineQueue(): import('bullmq').Queue;

export function normalizePipelineMessage(msg: Record<string, unknown>): Record<string, unknown>;

export function sendNotification(msg: NotificationPipelineMessage): Promise<Job>;
