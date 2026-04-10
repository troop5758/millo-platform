/**
 * PrivacySettingsPage — DSAR export, account deletion, privacy controls.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { TrustLabeledBadge } from '../components/TrustBadge';
import { getUser, logout, fetchMe, patchAuthPreferences } from '../sdk/authApi';
import {
  requestDsar,
  getDsarExport,
  requestDsarDelete,
  fetchDsarRequestList,
  getCcpaDoNotSell,
  setCcpaDoNotSell,
  getIpLoggingStatus,
  setIpLoggingPreference,
} from '../sdk/contentApi';

export function PrivacySettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [ccpaOptedOut, setCcpaOptedOut] = useState(false);
  const [ccpaBusy, setCcpaBusy] = useState(false);
  const [ipLogging, setIpLogging] = useState(true);
  const [ipLoggingBusy, setIpLoggingBusy] = useState(false);
  const [optOutFp, setOptOutFp] = useState(!!getUser()?.optOutFingerprinting);
  const [optOutFpBusy, setOptOutFpBusy] = useState(false);
  const [dsarList, setDsarList] = useState([]);
  const [dsarListErr, setDsarListErr] = useState('');

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchDsarRequestList()
      .then(setDsarList)
      .catch((e) => setDsarListErr(e.message || 'Failed to load requests'));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchMe()
      .then((u) => {
        if (u) setOptOutFp(!!u.optOutFingerprinting);
      })
      .catch(() => {});
  }, [user]);

  const handleExport = async () => {
    setExportBusy(true);
    setExportMsg('');
    try {
      await requestDsar('export');
      const data = await getDsarExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `millo-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(t('privacy.exportSuccess', 'Your data has been downloaded.'));
    } catch (e) {
      setExportMsg(e.message || t('privacy.exportFailed', 'Export failed.'));
    }
    setExportBusy(false);
  };

  const handleDeleteRequest = () => setShowDeleteModal(true);

  const handleDeleteConfirm = async () => {
    if (deleteConfirm !== 'DELETE') {
      setDeleteError(t('privacy.deleteConfirmRequired', 'Type DELETE to confirm'));
      return;
    }
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await requestDsarDelete(true, false);
      await logout();
      navigate('/', { replace: true });
      window.location.reload();
    } catch (e) {
      setDeleteError(e.message || t('privacy.deleteFailed', 'Account deletion failed.'));
    }
    setDeleteBusy(false);
  };

  if (!user) return null;

  return (
    <>
      <SEO title={t('privacy.settingsTitle', 'Privacy & Data')} description={t('privacy.settingsDesc', 'Export or delete your data')} path="/settings/privacy" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('privacy.settingsTitle', 'Privacy & Data')}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">{t('privacy.settingsDesc', 'Export or delete your data (GDPR, CCPA, LGPD)')}</p>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-8">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">
            {t('privacy.trustLayerTitle', 'Trust & safety (this deployment)')}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t(
              'privacy.trustLayerDesc',
              'Status reflects the API you are connected to—not a marketing guarantee.'
            )}
          </p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3">
            <TrustLabeledBadge label={t('privacy.trustPayments', 'Payments')} feature="payments" />
            <TrustLabeledBadge label={t('privacy.trustPayouts', 'Payouts')} feature="payouts" />
            <TrustLabeledBadge label={t('privacy.trustKyc', 'Identity verification (KYC)')} feature="kyc" />
            <TrustLabeledBadge label={t('privacy.trustModeration', 'AI moderation')} feature="moderation" />
            <TrustLabeledBadge label={t('privacy.trustFraud', 'Fraud protection')} feature="fraudProtection" />
            <TrustLabeledBadge label={t('privacy.trustEmail', 'Email delivery')} feature="email" />
            <TrustLabeledBadge label={t('privacy.trustPush', 'Push notifications')} feature="push" />
          </div>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-8">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">
            {t('privacy.dsarRequestsTitle', 'Your data requests')}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t('privacy.dsarRequestsDesc', 'Export, deletion, and other privacy requests you have submitted.')}
          </p>
          {dsarListErr && <p className="text-xs text-red-500 mb-2">{dsarListErr}</p>}
          {!dsarListErr && dsarList.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">{t('privacy.dsarNone', 'No requests yet.')}</p>
          )}
          {dsarList.length > 0 && (
            <ul className="text-sm space-y-2">
              {dsarList.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0">
                  <span className="text-[var(--text)]">
                    {r.type} · <span className="text-[var(--text-muted)]">{r.status}</span>
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--text)] mb-2">{t('privacy.ccpaTitle', 'CCPA — Do Not Sell')}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t('privacy.ccpaDesc', 'Opt out of the sale of your personal information (California residents).')}</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ccpaOptedOut}
                disabled={ccpaBusy}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setCcpaBusy(true);
                  try {
                    await setCcpaDoNotSell(v);
                    setCcpaOptedOut(v);
                  } catch (_) {}
                  setCcpaBusy(false);
                }}
                className="w-4 h-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">{t('privacy.ccpaOptOut', 'Do not sell my personal information')}</span>
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--text)] mb-2">{t('privacy.ipLoggingTitle', 'IP logging')}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t('privacy.ipLoggingDesc', 'Allow logging of your IP address for security and compliance.')}</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ipLogging}
                disabled={ipLoggingBusy}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setIpLoggingBusy(true);
                  try {
                    await setIpLoggingPreference(v);
                    setIpLogging(v);
                  } catch (_) {}
                  setIpLoggingBusy(false);
                }}
                className="w-4 h-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">{t('privacy.ipLoggingAllow', 'Allow IP logging')}</span>
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--text)] mb-2">{t('privacy.optOutFpTitle', 'Device fingerprinting (optional)')}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t('privacy.optOutFpDesc', 'Turn off optional device fingerprint collection.')}</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={optOutFp}
                disabled={optOutFpBusy}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setOptOutFpBusy(true);
                  try {
                    await patchAuthPreferences({ optOutFingerprinting: v });
                    setOptOutFp(v);
                  } catch (_) {}
                  setOptOutFpBusy(false);
                }}
                className="w-4 h-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">{t('privacy.optOutFpLabel', 'Opt out of device fingerprint collection')}</span>
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              <Link to="/privacy" className="text-[var(--accent)] hover:underline">{t('privacy.settingsPrivacyLink', 'Open full Privacy Policy')}</Link>
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-base font-semibold text-[var(--text)] mb-2">{t('privacy.exportTitle', 'Download your data')}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">{t('privacy.exportDesc', 'Get a copy of your personal data in JSON format.')}</p>
            <button
              type="button"
              onClick={handleExport}
              disabled={exportBusy}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {exportBusy ? t('common.loading', 'Loading…') : t('privacy.exportButton', 'Export my data')}
            </button>
            {exportMsg && (
              <p className={`text-sm mt-3 ${exportMsg.includes('downloaded') ? 'text-emerald-500' : 'text-red-500'}`}>{exportMsg}</p>
            )}
          </div>

          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-2">{t('privacy.deleteTitle', 'Delete account')}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">{t('privacy.deleteDesc', 'Permanently delete your account and all associated data. This cannot be undone.')}</p>
            <button
              type="button"
              onClick={handleDeleteRequest}
              className="px-4 py-2 rounded-xl border border-red-500/50 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/10"
            >
              {t('privacy.deleteButton', 'Delete my account')}
            </button>
          </div>

          <Link to="/profile" className="inline-block text-sm text-[var(--accent)] hover:underline">
            {t('common.back', 'Back')} → {t('nav.profile', 'Profile')}
          </Link>
        </div>

        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[var(--bg-elevated)] rounded-2xl p-6 shadow-2xl border border-[var(--border)]">
              <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">{t('privacy.deleteConfirmTitle', 'Confirm account deletion')}</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">{t('privacy.deleteConfirmDesc', 'Type DELETE below to confirm. This action cannot be undone.')}</p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] mb-4"
              />
              {deleteError && <p className="text-sm text-red-500 mb-2">{deleteError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleteBusy || deleteConfirm !== 'DELETE'}
                  className="flex-1 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteBusy ? t('common.loading', 'Loading…') : t('privacy.deleteConfirmButton', 'Delete forever')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(''); }}
                  className="flex-1 py-2 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
