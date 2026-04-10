/**
 * Production Truth Layer — env-derived snapshot (static shape for tooling / TS consumers).
 * Node services use `production-truth.js` for runtime resolution with provider detail.
 * https://milloapp.com
 */

export type MilloProductionTruthStatus = 'LIVE' | 'DISABLED' | 'BETA';

export const ProductionTruth = {
  payments: {
    status: (process.env.STRIPE_SECRET_KEY ? 'LIVE' : 'DISABLED') as MilloProductionTruthStatus,
  },
  payouts: {
    status: (process.env.STRIPE_PAYOUTS ? 'LIVE' : 'DISABLED') as MilloProductionTruthStatus,
  },
  email: {
    status: (process.env.EMAIL_PROVIDER ? 'LIVE' : 'DISABLED') as MilloProductionTruthStatus,
  },
  aiModeration: {
    status: (process.env.AI_MODERATION === 'true' ? 'LIVE' : 'BETA') as MilloProductionTruthStatus,
  },
  kyc: {
    status: (process.env.KYC_PROVIDER ? 'LIVE' : 'DISABLED') as MilloProductionTruthStatus,
  },
  /** Runtime JS resolves via oauthProviders; env hint only for static tooling. */
  oauth: {
    status: (process.env.GOOGLE_CLIENT_ID || process.env.OAUTH_GOOGLE_CLIENT_ID
      ? 'LIVE'
      : 'DISABLED') as MilloProductionTruthStatus,
  },
};
