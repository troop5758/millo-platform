/**
 * Feed guarantee engine. Runtime: `./engine.js`.
 * https://milloapp.com
 */

export function isFullyHydrated(item: unknown): boolean;

export function extractUserId(user: unknown): string | null;

export function getRankedContent(
  user: unknown,
  opts?: {
    limit?: number;
    offset?: number;
    context?: Record<string, unknown>;
    observe?: (stats: Record<string, unknown>) => void;
  }
): Promise<object[]>;

export function getTrending(
  user: unknown,
  opts?: {
    limit?: number;
    offset?: number;
    region?: Record<string, unknown>;
    contentFilter?: Record<string, unknown>;
    blockedCreatorIds?: string[];
  }
): Promise<object[]>;

export function buildFeed(
  user: unknown,
  opts?: {
    limit?: number;
    offset?: number;
    context?: Record<string, unknown>;
    observe?: (stats: Record<string, unknown>) => void;
    blockedCreatorIds?: string[];
    hasMore?: boolean;
    contentFilter?: Record<string, unknown>;
    region?: Record<string, unknown>;
  }
): Promise<object[]>;
