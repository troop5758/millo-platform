/**
 * Millo control plane — capability modes (mandatory core).
 * Runtime implementation: `./index.js` (CommonJS). https://milloapp.com
 */

export type Mode = 'LIVE' | 'PARTIAL' | 'STUBBED' | 'DISABLED' | 'SHADOW';

export type ControlPlaneFeature =
  | 'payments'
  | 'payouts'
  | 'email'
  | 'push'
  | 'kyc'
  | 'aiModeration'
  | 'liveStreaming'
  | 'liveFilters'
  | 'oauth'
  | 'fraudProtection';

export type ControlPlaneModes = Record<string, Mode | string>;

export function getControlPlaneModes(): ControlPlaneModes;

/** Proxy: each key reads current mode (prefer getControlPlaneModes() for a snapshot object). */
export const ControlPlane: ControlPlaneModes;

export function requireCapability(
  feature: ControlPlaneFeature
): (
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply
) => Promise<void>;

export function requireCapabilityLive(
  capabilityId: string
): (
  req: import('fastify').FastifyRequest,
  reply: import('fastify').FastifyReply
) => Promise<void>;

export function getControlPlaneSnapshot(): {
  version: number;
  ts: string;
  live: { streaming: string; filters: string };
  capabilities: Record<string, { mode: string; truthStatus?: string | null; detail?: unknown }>;
};

export function isCapabilityLive(capabilityId: string, mode: string): boolean;

export class SystemDisabledError extends Error {
  code: string;
  capability?: string;
  mode?: string;
  statusCode: number;
}
