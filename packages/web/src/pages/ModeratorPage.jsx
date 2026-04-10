/**
 * Moderator dashboard — live moderation, abuse queue, appeals.
 * Style matches Millo design: dark theme, card layout, shield/gavel icons.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useStaffAuth } from '../context/StaffAuth';
import { IconMod, IconBack, IconLive, IconFlag, IconAppeal } from '../components/StaffIcons';
import * as api from '../sdk/dashboardsApi';

function ModeratorContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [reports, setReports] = useState([]);
  const [reportStatus, setReportStatus] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [appealStatus, setAppealStatus] = useState('pending');
  const [liveStreamId, setLiveStreamId] = useState('');
  const [liveAction, setLiveAction] = useState('warn');
  const [liveReason, setLiveReason] = useState('');
  const [resolveAppealId, setResolveAppealId] = useState('');
  const [resolveDecision, setResolveDecision] = useState('upheld');
  const [resolveReason, setResolveReason] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const loadReports = async () => {
    try {
      const list = await api.modAbuseQueue(staffUser, reportStatus || undefined, 50);
      setReports(Array.isArray(list) ? list : []);
    } catch (e) {
      showMsg('err', e.message || t('mod.errLoadReports'));
    }
  };

  const loadAppeals = async () => {
    try {
      const list = await api.modAppeals(staffUser, appealStatus || undefined, 50);
      setAppeals(Array.isArray(list) ? list : []);
    } catch (e) {
      showMsg('err', e.message || t('mod.errLoadAppeals'));
    }
  };

  useEffect(() => {
    loadReports();
  }, [staffUser, reportStatus]);

  useEffect(() => {
    loadAppeals();
  }, [staffUser, appealStatus]);

  const handleLiveModeration = async (e) => {
    e.preventDefault();
    if (!liveStreamId.trim()) {
      showMsg('err', t('mod.errStreamIdRequired'));
      return;
    }
    try {
      await api.modLiveModeration(staffUser, liveStreamId.trim(), liveAction, { reason: liveReason || undefined });
      showMsg('ok', t('mod.actionApplied', { action: liveAction }));
      setLiveStreamId('');
      setLiveReason('');
    } catch (e) {
      showMsg('err', e.message || t('common.failed'));
    }
  };

  const handleResolveAppeal = async (e) => {
    e.preventDefault();
    if (!resolveAppealId.trim()) {
      showMsg('err', t('mod.errAppealIdRequired'));
      return;
    }
    try {
      await api.modResolveAppeal(staffUser, resolveAppealId.trim(), resolveDecision, resolveReason || undefined);
      showMsg('ok', t('mod.appealResolved'));
      setResolveAppealId('');
      setResolveReason('');
      loadAppeals();
    } catch (e) {
      showMsg('err', e.message || t('common.failed'));
    }
  };

  return (
    <>
      <SEO title={t('mod.seoTitle')} description={t('mod.seoDesc')} path="/mod" />
      <div className="staff-dashboard min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <header className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--staff-accent)]" style={{ backgroundColor: 'var(--staff-bg-card)' }}>
                <IconMod className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm staff-label">{t('mod.dashboardTitle')}</p>
                <h1 className="text-2xl font-bold text-[var(--staff-text)]">{t('mod.moderator')}</h1>
              </div>
            </div>
            <Link to="/" className="flex items-center gap-2 staff-label hover:text-[var(--staff-text)] text-sm transition-colors">
              <IconBack className="w-5 h-5" />
              {t('common.backToHome')}
            </Link>
          </header>

          {message.text && (
            <div
              className={`mb-6 p-4 rounded-xl text-sm font-medium ${
                message.type === 'err'
                  ? 'bg-[var(--staff-error)]/15 text-[var(--staff-error)]'
                  : 'bg-[var(--staff-success)]/15 text-[var(--staff-success)]'
              }`}
            >
              {message.text}
            </div>
          )}

          <section className="staff-card mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--staff-accent)]" style={{ backgroundColor: 'var(--staff-bg-elevated)' }}>
                <IconLive className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--staff-text)]">{t('mod.liveModeration')}</h2>
            </div>
            <form onSubmit={handleLiveModeration} className="space-y-3">
              <input type="text" placeholder={t('mod.streamIdPlaceholder')} value={liveStreamId} onChange={(e) => setLiveStreamId(e.target.value)} className="staff-input" />
              <select value={liveAction} onChange={(e) => setLiveAction(e.target.value)} className="staff-select w-full">
                <option value="warn">{t('mod.actionWarn')}</option>
                <option value="timeout">{t('mod.actionTimeout')}</option>
                <option value="end">{t('mod.actionEnd')}</option>
              </select>
              <input type="text" placeholder={t('mod.reasonPlaceholder')} value={liveReason} onChange={(e) => setLiveReason(e.target.value)} className="staff-input" />
              <button type="submit" className="staff-btn-primary">{t('mod.apply')}</button>
            </form>
          </section>

          <section className="staff-card mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--staff-accent)]" style={{ backgroundColor: 'var(--staff-bg-elevated)' }}>
                <IconFlag className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--staff-text)]">{t('mod.abuseQueue')}</h2>
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              <select value={reportStatus} onChange={(e) => setReportStatus(e.target.value)} className="staff-select">
                <option value="">{t('common.all')}</option>
                <option value="pending">{t('common.pending')}</option>
                <option value="resolved">{t('common.resolved')}</option>
              </select>
              <button type="button" className="staff-btn-primary" onClick={loadReports}>{t('common.refresh')}</button>
            </div>
            <ul className="space-y-2 max-h-48 overflow-auto">
              {reports.map((r) => (
                <li key={r._id} className="text-sm staff-label">
                  {r._id} — {r.status} {r.reporterId && t('mod.by', { id: r.reporterId })}
                </li>
              ))}
              {reports.length === 0 && <li className="staff-label">{t('mod.noReports')}</li>}
            </ul>
          </section>

          <section className="staff-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--staff-accent)]" style={{ backgroundColor: 'var(--staff-bg-elevated)' }}>
                <IconAppeal className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--staff-text)]">{t('mod.appeals')}</h2>
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              <select value={appealStatus} onChange={(e) => setAppealStatus(e.target.value)} className="staff-select">
                <option value="pending">{t('common.pending')}</option>
                <option value="upheld">{t('mod.upheld')}</option>
                <option value="overturned">{t('mod.overturned')}</option>
              </select>
              <button type="button" className="staff-btn-primary" onClick={loadAppeals}>{t('common.refresh')}</button>
            </div>
            <ul className="space-y-2 max-h-48 overflow-auto mb-4">
              {appeals.map((a) => (
                <li key={a._id} className="text-sm staff-label">
                  {a._id} — {a.status}
                </li>
              ))}
              {appeals.length === 0 && <li className="staff-label">{t('mod.noAppeals')}</li>}
            </ul>
            <form onSubmit={handleResolveAppeal} className="space-y-3">
              <input type="text" placeholder={t('mod.appealIdPlaceholder')} value={resolveAppealId} onChange={(e) => setResolveAppealId(e.target.value)} className="staff-input" />
              <select value={resolveDecision} onChange={(e) => setResolveDecision(e.target.value)} className="staff-select w-full">
                <option value="upheld">{t('mod.upheld')}</option>
                <option value="overturned">{t('mod.overturned')}</option>
              </select>
              <input type="text" placeholder={t('mod.reasonPlaceholder')} value={resolveReason} onChange={(e) => setResolveReason(e.target.value)} className="staff-input" />
              <button type="submit" className="staff-btn-primary">{t('mod.resolveAppeal')}</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

export function ModeratorPage() {
  return (
    <ProtectedRoute requireRole="mod">
      <ModeratorContent />
    </ProtectedRoute>
  );
}
