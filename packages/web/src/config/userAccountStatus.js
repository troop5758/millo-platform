/**
 * User account status — mirror of @millo/shared userAccountStatus for admin UI.
 * https://milloapp.com
 */
export const USER_ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
});

/** Effective status for display when legacy flags.suspended is set without status. */
export function effectiveUserAccountStatus(user) {
  if (!user) return USER_ACCOUNT_STATUS.ACTIVE;
  const raw = user.status || USER_ACCOUNT_STATUS.ACTIVE;
  if (raw === USER_ACCOUNT_STATUS.ACTIVE && user.flags?.suspended === true) {
    return USER_ACCOUNT_STATUS.SUSPENDED;
  }
  return raw;
}

export function accountStatusBadgeClass(status) {
  switch (status) {
    case USER_ACCOUNT_STATUS.BANNED:
      return { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' };
    case USER_ACCOUNT_STATUS.SUSPENDED:
      return { dot: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50' };
    case USER_ACCOUNT_STATUS.RESTRICTED:
      return { dot: 'bg-violet-500', text: 'text-violet-800', bg: 'bg-violet-50' };
    case USER_ACCOUNT_STATUS.ACTIVE:
      return { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' };
    default:
      return { dot: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-100' };
  }
}
