/**
 * Security hardening contract. Runtime: `./hardening.js`.
 * https://milloapp.com
 */

export interface HardeningPillar {
  summary: string;
  references: string[];
}

export const HARDENING_PILLARS: {
  readonly rateLimiting: HardeningPillar;
  readonly cspHsts: HardeningPillar;
  readonly tls13: HardeningPillar;
  readonly auditLogs: HardeningPillar;
  readonly encryptedBackups: HardeningPillar;
};

export function getSecurityHardeningContract(): {
  pillars: Record<string, HardeningPillar>;
  productionUrl: string;
  phaseDoc: string;
  validator: string;
};

export function getSecurityHardeningRuntimeHints(): {
  rateLimitRedisStore: boolean;
  trustProxy: boolean;
  nodeEnv: string;
};
