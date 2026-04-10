/**
 * Commerce core. Runtime: `./seller.js`, `./auction.js`.
 * https://milloapp.com
 */

export function enforceSellerVerified(seller: {
  verified?: boolean;
  sellerStatus?: string;
  status?: string;
} | null | undefined): void;

export function assertSellerVerified(creatorId: string | object): Promise<void>;

/** Expired payment window, still awaiting_payment, no paidAt. */
export function isAuctionExpiredAndUnpaid(auction: object): boolean;

export function reassignWinner(auction: object): Promise<{
  reassigned: boolean;
  reason?: string;
  new_winner?: unknown;
}>;

export function penalizeUser(
  winnerId: string | object | null | undefined,
  auction: object,
  reason: string,
  extraMeta?: object
): Promise<void>;

export function processExpiredUnpaidAuction(auction: object): Promise<{
  acted: boolean;
  outcome: 'skipped' | 'reassigned' | 'defaulted';
  result?: object;
}>;

export const runAuctionPaymentEnforcement: () => Promise<{
  processed: number;
  skippedNotDue: number;
  defaulted: number;
  reassigned: number;
}>;
