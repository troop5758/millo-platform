/**
 * Seller onboarding + Stripe Connect (approved creators).
 * https://milloapp.com
 */
import { apiGet, apiPost } from './httpClient';

export async function fetchSellerOnboarding() {
  return apiGet('/seller/onboarding');
}

export async function saveSellerOnboarding(payload) {
  return apiPost('/seller/onboarding', payload);
}

/** Requires approved creator + Stripe configured on API. Returns { url } for hosted onboarding. */
export async function startStripeConnectOnboarding() {
  return apiPost('/payments/creator-wallet/stripe-connect', {});
}
