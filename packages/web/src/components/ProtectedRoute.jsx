/**
 * Protects staff dashboard routes by role. Renders children if user has required role, else access denied.
 * Style matches Millo staff dashboards: dark theme, card layout.
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStaffAuth, hasStaffRole } from '../context/StaffAuth';
import { IconShield, IconBack } from './StaffIcons';
import { getUser } from '../sdk/authApi';

const IS_DEV = import.meta.env.DEV;

export function ProtectedRoute({ children, requireRole }) {
  const { t } = useTranslation();
  const { staffUser, setStaffUser } = useStaffAuth();
  // If a role is not provided, treat this as a general authenticated guard.
  // This keeps user flows (e.g. support ticket creation) working.
  const user = getUser?.();
  const allowed = requireRole
    ? staffUser && hasStaffRole(staffUser, requireRole)
    : !!user;

  if (allowed) {
    return (
      <>
        {IS_DEV && staffUser ? (
          <div
            className="bg-amber-500/15 border-b border-amber-500/40 text-amber-950 dark:text-amber-100 text-center text-xs py-2 px-3"
            role="status"
          >
            Development staff role override active ({staffUser.role}) — not production authorization.
          </div>
        ) : null}
        {children}
      </>
    );
  }

  return (
    <div className="staff-dashboard min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="staff-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--staff-error)]" style={{ backgroundColor: 'var(--staff-bg-elevated)' }}>
              <IconShield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--staff-text)]">{t('protectedRoute.accessDenied')}</h1>
              <p className="text-sm staff-label mt-0.5">
                {t('protectedRoute.requiresRole', { role: requireRole })}
              </p>
            </div>
          </div>
          <p className="staff-label text-sm mb-6">
            {IS_DEV ? t('protectedRoute.devHint') : t('protectedRoute.contactAdmin')}
          </p>
          {IS_DEV && (
            <div className="flex flex-wrap gap-3">
              {['admin', 'mod', 'support', 'ops'].map((role) => (
                <button
                  key={role}
                  type="button"
                  className="staff-btn-primary text-sm py-2 px-4 capitalize"
                  onClick={() => setStaffUser({ userId: 'staff-dev', role })}
                >
                  {t('protectedRoute.useAs', { role })}
                </button>
              ))}
              {staffUser && (
                <button
                  type="button"
                  className="staff-btn-secondary text-sm py-2 px-4"
                  onClick={() => setStaffUser(null)}
                >
                  {t('protectedRoute.clearStaff')}
                </button>
              )}
            </div>
          )}
          <p className="mt-6 text-sm staff-label">
            <Link to="/help" className="text-[var(--staff-accent)] hover:underline flex items-center gap-2 inline-flex">
              <IconBack className="w-4 h-4" />
              {t('common.backToHome')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
