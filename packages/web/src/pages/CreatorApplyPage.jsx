/**
 * CreatorApplyPage — creators submit their onboarding application.
 * POST /creators/apply
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { fetchCreatorApplication, applyAsCreator } from '../sdk/contentApi';

const CATEGORIES = ['general', 'gaming', 'music', 'art', 'cooking', 'fitness', 'education', 'comedy', 'beauty', 'tech', 'lifestyle'];

export function CreatorApplyPage() {
  const navigate = useNavigate();
  const { t }    = useTranslation();
  const user     = getUser();
  const [existing, setExisting] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);
  const [form, setForm] = useState({
    displayName:  user?.displayName || '',
    bio:          '',
    category:     'general',
    youtube:      '',
    instagram:    '',
    tiktok:       '',
    sampleContent:'',
  });

  const STATUS_UI = {
    pending:  { label: t('creatorApply.statusPending'),  color: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',   icon: '⏳' },
    approved: { label: t('creatorApply.statusApproved'), color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: '✓' },
    rejected: { label: t('creatorApply.statusRejected'), color: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',             icon: '✗' },
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchCreatorApplication().then((d) => {
      if (d?.application) setExisting(d.application);
    }).finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await applyAsCreator({
        displayName:  form.displayName.trim(),
        bio:          form.bio.trim(),
        category:     form.category,
        socialLinks:  { youtube: form.youtube, instagram: form.instagram, tiktok: form.tiktok },
        sampleContent: form.sampleContent ? [form.sampleContent] : [],
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (success || existing) {
    const st = (existing?.status) || 'pending';
    const ui = STATUS_UI[st] || STATUS_UI.pending;
    return (
      <>
        <SEO title={t('creatorApply.title')} description="Apply to become a Millo creator." path="/creator-apply" />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold mb-6 ${ui.color}`}>
            <span className="text-base">{ui.icon}</span> {ui.label}
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-3">
            {st === 'approved' ? t('creatorApply.welcomeTitle') : t('creatorApply.submittedTitle')}
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            {st === 'pending'  && t('creatorApply.pendingDesc')}
            {st === 'approved' && t('creatorApply.approvedDesc')}
            {st === 'rejected' && (existing?.reviewNote || t('creatorApply.pendingDesc'))}
          </p>
          <div className="flex justify-center gap-3">
            {st === 'approved' && (
              <Link to="/go-live"
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
                {t('creatorApply.goLive')}
              </Link>
            )}
            <Link to="/"
              className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
              {t('creatorApply.backToHome')}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const PERKS = [
    { icon: '📡', title: t('creatorApply.perkGoLiveTitle'), desc: t('creatorApply.perkGoLiveDesc') },
    { icon: '💰', title: t('creatorApply.perkEarnTitle'),   desc: t('creatorApply.perkEarnDesc') },
    { icon: '🎯', title: t('creatorApply.perkGrowTitle'),   desc: t('creatorApply.perkGrowDesc') },
  ];

  return (
    <>
      <SEO title={t('creatorApply.title')} description="Apply to join the Millo creator program." path="/creator-apply" />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-2">{t('creatorApply.title')}</h1>
          <p className="text-[var(--text-muted)]">{t('creatorApply.subtitle')}</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
              <div className="text-2xl mb-2">{p.icon}</div>
              <p className="font-semibold text-[var(--text)] text-sm">{p.title}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{p.desc}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">{t('creatorApply.displayNameLabel')}</label>
            <input type="text" required value={form.displayName} onChange={set('displayName')} maxLength={60}
              placeholder={t('creatorApply.displayNamePlaceholder')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">{t('creatorApply.bioLabel')}</label>
            <textarea required value={form.bio} onChange={set('bio')} rows={4} maxLength={2000}
              placeholder={t('creatorApply.bioPlaceholder')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">{t('creatorApply.categoryLabel')}</label>
            <select value={form.category} onChange={set('category')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--text-muted)]">{t('creatorApply.socialsLabel')}</label>
            {[
              { key: 'youtube',   placeholder: t('creatorApply.youtubePlaceholder') },
              { key: 'instagram', placeholder: t('creatorApply.instagramPlaceholder') },
              { key: 'tiktok',    placeholder: t('creatorApply.tiktokPlaceholder') },
            ].map(({ key, placeholder }) => (
              <input key={key} type="url" value={form[key]} onChange={set(key)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">{t('creatorApply.sampleContentLabel')}</label>
            <input type="url" value={form.sampleContent} onChange={set('sampleContent')}
              placeholder={t('creatorApply.sampleContentPlaceholder')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">{error}</div>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('creatorApply.submitting')}</>
            ) : t('creatorApply.submit')}
          </button>
          <p className="text-xs text-[var(--text-muted)] text-center">
            {t('creatorApply.termsNote')}{' '}
            <Link to="/terms" className="text-[var(--accent)] hover:underline">{t('creatorApply.creatorTerms')}</Link>.
            {' '}{t('creatorApply.reviewTime')}
          </p>
        </form>
      </div>
    </>
  );
}
