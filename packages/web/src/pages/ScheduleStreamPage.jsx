/**
 * ScheduleStreamPage — schedule a live stream for a future time.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { scheduleStream } from '../sdk/contentApi';

export function ScheduleStreamPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = getUser();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [streamType, setStreamType] = useState('standard');
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const handleSchedule = async () => {
    if (!title.trim()) {
      setError(t('scheduleStream.errorTitle'));
      return;
    }
    if (!date) {
      setError(t('scheduleStream.errorDate'));
      return;
    }
    const startDate = new Date(date);
    if (isNaN(startDate.getTime()) || startDate <= new Date()) {
      setError(t('scheduleStream.errorFuture'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await scheduleStream({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledStart: startDate.toISOString(),
        streamType,
        notifyFollowers,
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message || t('scheduleStream.errorGeneric'));
    }
    setBusy(false);
  };

  const minDateTime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1);
    return d.toISOString().slice(0, 16);
  };

  return (
    <>
      <SEO title={t('scheduleStream.title')} description={t('scheduleStream.subtitle')} path="/schedule-stream" />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('scheduleStream.title')}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t('scheduleStream.subtitle')}</p>
          </div>
        </div>

        {success ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-[var(--text)] mb-1">{t('scheduleStream.scheduled')}</p>
            <p className="text-sm text-[var(--text-muted)] mb-4">{t('scheduleStream.scheduledDesc')}</p>
            <div className="flex gap-3 justify-center">
              <Link to="/dashboard" className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
                {t('scheduleStream.viewDashboard')}
              </Link>
              <button
                type="button"
                onClick={() => { setSuccess(false); setTitle(''); setDate(''); setDescription(''); }}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-elevated)] transition-colors"
              >
                {t('scheduleStream.scheduleAnother')}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('scheduleStream.titleLabel')} *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('scheduleStream.titlePlaceholder')}
                maxLength={200}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('scheduleStream.descriptionLabel')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('scheduleStream.descriptionPlaceholder')}
                rows={3}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('scheduleStream.dateLabel')} *</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={minDateTime()}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('scheduleStream.streamTypeLabel')}</label>
              <select
                value={streamType}
                onChange={(e) => setStreamType(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              >
                <option value="standard">{t('scheduleStream.typeStandard')}</option>
                <option value="auction">{t('scheduleStream.typeAuction')}</option>
                <option value="paid_event">{t('scheduleStream.typePaidEvent')}</option>
                <option value="product_launch">{t('scheduleStream.typeProductLaunch')}</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyFollowers}
                onChange={(e) => setNotifyFollowers(e.target.checked)}
                className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text)]">{t('scheduleStream.notifyFollowers')}</span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="button"
              onClick={handleSchedule}
              disabled={busy || !title.trim() || !date}
              className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('scheduleStream.scheduling')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('scheduleStream.schedule')}
                </>
              )}
            </button>
          </div>
        )}

        <p className="mt-6 text-center flex flex-wrap justify-center gap-4">
          <Link to="/go-live" className="text-sm text-[var(--accent)] hover:underline">
            {t('scheduleStream.goLiveInstead')}
          </Link>
          <Link to="/live/upcoming" className="text-sm text-[var(--accent)] hover:underline">
            {t('scheduleStream.viewUpcoming')}
          </Link>
        </p>
      </div>
    </>
  );
}
