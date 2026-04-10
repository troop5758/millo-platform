import { features } from './features';

/**
 * Single source of truth for primary header navigation (see layout/Layout.jsx).
 * Item shape: { labelKey, to, icon?, audience?, roles?, hidden?, featureFlag?, milloFeature? }
 * - labelKey: i18n key passed to t(labelKey)
 * - icon: 'live' | 'flash' | 'trending' | 'search' | 'user' (mapped in Layout)
 * - audience: 'all' | 'guest' | 'auth' | 'admin' (default 'all') — visibility source of truth
 * - roles: optional string[] for docs/tooling; must align with audience (e.g. ['admin'])
 * - hidden: if true, utility link styling (compact / lg:inline) where applicable
 * - featureFlag: optional import.meta.env key — link omitted unless env[featureFlag] is truthy
 * - featureFlagMode: 'degraded' keeps the link visible when the flag is off (surface shows coming soon)
 * - milloFeature: key on `features` from config/features.js — link hidden when false (e.g. liveGoLive)
 * - isActiveMatch: optional (pathname) => boolean for header active state (see Layout.jsx)
 * https://milloapp.com
 */

/**
 * @param {object | null} user from getUser()
 * @returns {boolean}
 */
export function isAdminUser(user) {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    (Array.isArray(user.roles) && user.roles.includes('admin')) ||
    user.flags?.isAdmin === true
  );
}

/**
 * @param {object} item
 * @param {object | null} user
 * @returns {boolean}
 */
export function isNavItemVisible(item, user) {
  if (item.milloFeature != null && features[item.milloFeature] === false) {
    return false;
  }
  if (item.featureFlag) {
    try {
      if (!import.meta.env[item.featureFlag]) {
        if (item.featureFlagMode === 'degraded') return true;
        return false;
      }
    } catch {
      if (item.featureFlagMode === 'degraded') return true;
      return false;
    }
  }
  const audience = item.audience || 'all';
  if (audience === 'all') return true;
  if (audience === 'guest') return !user;
  if (audience === 'auth') return !!user;
  if (audience === 'admin') return isAdminUser(user);
  return true;
}

/** Core discovery + browse (everyone). */
export const mainNav = [
  { labelKey: 'nav.live', to: '/live', icon: 'live', audience: 'all', milloFeature: 'liveStreaming' },
  { labelKey: 'nav.explore', to: '/feed', icon: 'flash', audience: 'all' },
  {
    labelKey: 'nav.creators',
    to: '/creators',
    icon: 'user',
    audience: 'all',
    isActiveMatch: (p) =>
      p === '/creators' ||
      (p.startsWith('/creator/') && !p.includes('/shop')),
  },
  {
    labelKey: 'nav.storefront',
    to: '/store',
    icon: 'store',
    audience: 'all',
    isActiveMatch: (p) =>
      p === '/store' ||
      p.startsWith('/store/') ||
      /\/creator\/[^/]+\/shop(?:\/|$)/.test(p),
  },
  { labelKey: 'nav.trendingSounds', to: '/sounds/trending', icon: 'trending', audience: 'all' },
  { labelKey: 'nav.search', to: '/search', icon: 'search', audience: 'all' },
];

/** Shown when logged out (e.g. profile CTA). */
export const guestNav = [{ labelKey: 'nav.profile', to: '/profile', icon: 'user', audience: 'guest' }];

/** Shown when logged in — creator / account tools. */
export const authNav = [
  { labelKey: 'nav.goLive', to: '/go-live', icon: 'live', audience: 'auth', milloFeature: 'liveGoLive' },
  { labelKey: 'nav.messages', to: '/messages', icon: 'user', audience: 'auth' },
  { labelKey: 'nav.calls', to: '/calls', icon: 'user', audience: 'auth' },
  { labelKey: 'nav.notifications', to: '/notifications', icon: 'search', audience: 'auth' },
  { labelKey: 'nav.dashboard', to: '/dashboard', icon: 'user', audience: 'auth' },
  { labelKey: 'nav.ads', to: '/ads', icon: 'trending', audience: 'auth' },
];

/** Activity & social surfaces (authenticated). */
export const activityNav = [
  { labelKey: 'nav.activity', to: '/activity', icon: 'flash', audience: 'auth', roles: ['user'] },
];

/** Seller flows (authenticated). */
export const sellerNav = [
  {
    labelKey: 'nav.sellerOnboarding',
    to: '/seller/onboarding',
    icon: 'user',
    audience: 'auth',
    roles: ['user'],
  },
];

/**
 * Admin / staff operational surfaces (admin only).
 * Disputes staff view lives at /admin/disputes — not mixed with /disputes.
 */
export const adminSurfaceNav = [
  { labelKey: 'nav.adminDisputes', to: '/admin/disputes', icon: 'user', audience: 'admin', roles: ['admin'] },
  { labelKey: 'nav.opsHealth', to: '/ops/health', icon: 'live', audience: 'admin', roles: ['admin'] },
  { labelKey: 'nav.opsWorkers', to: '/ops/workers', icon: 'user', audience: 'admin', roles: ['admin'] },
  { labelKey: 'nav.opsQueues', to: '/ops/queues', icon: 'user', audience: 'admin', roles: ['admin'] },
  { labelKey: 'nav.aiControls', to: '/admin/ai-controls', icon: 'user', audience: 'admin', roles: ['admin'] },
];

/** Footer-adjacent / compact utility row. */
export const utilityNav = [
  { labelKey: 'nav.help', to: '/help', audience: 'all', hidden: false },
  { labelKey: 'nav.admin', to: '/admin', audience: 'admin', hidden: true },
  { labelKey: 'nav.support', to: '/support', audience: 'all', hidden: true },
  { labelKey: 'nav.mod', to: '/mod', audience: 'all', hidden: true },
];

/**
 * Flatten nav entries for the main header (desktop + mobile) in display order.
 * @param {object | null} user
 * @returns {Array<object>}
 */
export function getHeaderNavEntries(user) {
  const chunks = [
    mainNav.filter((i) => isNavItemVisible(i, user)),
    ...(user
      ? [
          ...authNav.filter((i) => isNavItemVisible(i, user)),
          ...activityNav.filter((i) => isNavItemVisible(i, user)),
          ...sellerNav.filter((i) => isNavItemVisible(i, user)),
          ...adminSurfaceNav.filter((i) => isNavItemVisible(i, user)),
        ]
      : guestNav.filter((i) => isNavItemVisible(i, user))),
  ];
  return chunks.flat();
}

/**
 * @param {object | null} user
 */
export function getUtilityNavEntries(user) {
  return utilityNav.filter((i) => isNavItemVisible(i, user));
}

/**
 * Default active state for marketing / header links (guest shell).
 * @param {string} to
 * @returns {(p: string) => boolean}
 */
function defaultMarketingActiveMatch(to) {
  return (p) => {
    if (to === '/') return p === '/';
    return p === to || p.startsWith(`${to}/`);
  };
}

/**
 * Public marketing header entries — same visibility rules as main nav for guests,
 * plus home, pricing, and help. Keeps feature flags (e.g. live) in sync with the app shell.
 * https://milloapp.com
 */
export function getMarketingNavEntries() {
  const guest = null;
  const home = {
    labelKey: 'nav.home',
    to: '/',
    isActiveMatch: (p) => p === '/',
  };
  const core = mainNav
    .filter((i) => isNavItemVisible(i, guest))
    .map((i) => ({
      labelKey: i.labelKey,
      to: i.to,
      isActiveMatch: i.isActiveMatch || defaultMarketingActiveMatch(i.to),
    }));
  const tail = [
    {
      labelKey: 'nav.pricing',
      to: '/pricing',
      isActiveMatch: (p) => p === '/pricing',
    },
    {
      labelKey: 'nav.help',
      to: '/help',
      isActiveMatch: (p) => p === '/help',
    },
  ];
  return [home, ...core, ...tail];
}
