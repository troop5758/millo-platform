/**
 * Live status UI / API contract. Runtime: `./status.js`.
 * https://milloapp.com
 */

/** Ingest filters: only LIVE enables full filters product UI. */
export type LiveFiltersMode = 'LIVE' | 'STUBBED';

export interface LiveStatusShape {
  /** Same as ControlPlane.liveStreaming (LIVE | PARTIAL | DISABLED | …). */
  streaming: string;
  filters: LiveFiltersMode;
}

/** Property reads resolve current control-plane + live layer (not frozen at import time). */
export const LiveStatus: LiveStatusShape;

export function getLiveStatus(): LiveStatusShape;

/** UI gate: use `if (!isLiveFiltersLive(filters)) return <ComingSoon />` (or equivalent). */
export function isLiveFiltersLive(filters?: string): boolean;
