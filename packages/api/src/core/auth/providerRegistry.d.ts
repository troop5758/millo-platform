/**
 * Enterprise auth provider registry. Runtime: `./providerRegistry.js`.
 * https://milloapp.com
 */

export type AuthProviderMode = 'LIVE' | 'DISABLED';

export type EnterpriseAuthProviderId = 'google' | 'apple';

export interface AuthProvidersShape {
  google: AuthProviderMode;
  apple: AuthProviderMode;
}

/** Reads current env on each property access (`google` | `apple`). */
export const AuthProviders: AuthProvidersShape;

export function getAuthProviderMode(providerId: EnterpriseAuthProviderId): AuthProviderMode;

export function getAuthProvidersSnapshot(): AuthProvidersShape;

/** Throws `Error("Google login unavailable")` when Google client id is not configured. */
export function assertGoogleLoginAvailable(): void;

/** Throws `Error("<Google|Apple> login unavailable")` when provider client id is not configured. */
export function assertAuthProviderAvailable(providerId: EnterpriseAuthProviderId): void;
