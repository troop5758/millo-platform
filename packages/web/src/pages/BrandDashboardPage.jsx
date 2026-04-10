/**
 * Brand Dashboard — Ad campaign management and analytics for advertisers.
 * Lists campaigns with impressions, clicks, spend, CTR. Create and manage campaigns.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import {
  fetchAdsCampaigns,
  createAdCampaign,
  fetchAdCampaign,
  fetchCampaignAds,
  deleteAdCampaign,
} from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';

function fmtNum(n) {
  if (n == null || n === undefined) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function fmtCents(c) {
  if (c == null || c === undefined) return '$0';
  return '$' + (c / 100).toFixed(2);
}

function NewCampaignModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('awareness');
  const [budgetCents, setBudgetCents] = useState('');
  const [regionCodes, setRegionCodes] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr(t('dashboard.campaignRequired'));
      return;
    }
    setBusy(true);
    const countries = regionCodes.trim()
      ? regionCodes.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
      : undefined;
    try {
      const data = await createAdCampaign({
        name: name.trim(),
        objective,
        budgetCents: Math.round(Number(budgetCents) || 0) * 100,
        targetAudience: countries?.length ? { countries } : {},
      });
      onCreated(data.campaign);
      onClose();
    } catch (e) {
      setErr(e.message || 'Failed to create campaign');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--text)] mb-4">{t('dashboard.newCampaign')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignName')} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Campaign"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignObjective')}</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="awareness">Awareness</option>
              <option value="traffic">Traffic</option>
              <option value="conversions">Conversions</option>
              <option value="followers">Followers</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignBudget')}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budgetCents}
              onChange={(e) => setBudgetCents(e.target.value)}
              placeholder="100"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.regionTargeting', 'Region targeting (ISO country codes)')}</label>
            <input
              type="text"
              value={regionCodes}
              onChange={(e) => setRegionCodes(e.target.value)}
              placeholder="US, CA, GB (leave empty for all)"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] bg-[var(--bg-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium text-sm hover:bg-[var(--bg-elevated)]">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? t('dashboard.creating') : t('dashboard.createCampaign')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BrandDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignAds, setCampaignAds] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: location.pathname || '/ads' } });
      return;
    }
    fetchAdsCampaigns(50)
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  useEffect(() => {
    if (!selectedCampaign) {
      setCampaignAds([]);
      return;
    }
    fetchAdCampaign(selectedCampaign)
      .then((data) => setCampaignAds(data.ads || []))
      .catch(() => setCampaignAds([]));
  }, [selectedCampaign]);

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm(t('brand.confirmDelete') || 'Delete this campaign? Draft campaigns only.')) return;
    try {
      await deleteAdCampaign(id);
      setCampaigns((prev) => prev.filter((c) => String(c._id) !== String(id)));
      if (selectedCampaign === id) setSelectedCampaign(null);
    } catch (e) {
      alert(e.message || 'Failed to delete');
    }
  };

  if (!user) return null;

  return (
    <>
      <SEO title={location.pathname === '/ads' ? (t('ads.manager') || 'Ads Manager') : (t('brand.title') || 'Brand Dashboard')} description={t('brand.desc') || 'Manage your ad campaigns'} path={location.pathname} />
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">{location.pathname === '/ads' ? (t('ads.manager') || 'Ads Manager') : (t('brand.title') || 'Brand Dashboard')}</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">{t('brand.desc') || 'Manage your ad campaigns and view performance'}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/dashboard" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
                {t('brand.backToCreator') || 'Creator Dashboard'}
              </Link>
              <button
                type="button"
                onClick={() => setShowNewCampaign(true)}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors"
              >
                {t('dashboard.newCampaignShort') || '+ New Campaign'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
              <div className="w-20 h-20 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
              <p className="text-[var(--text-muted)] font-medium mb-1">{t('dashboard.noCampaigns')}</p>
              <p className="text-sm text-[var(--text-muted)] mb-6">{t('dashboard.noCampaignsDesc')}</p>
              <button
                type="button"
                onClick={() => setShowNewCampaign(true)}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)]"
              >
                {t('dashboard.createCampaign')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{t('brand.totalCampaigns') || 'Campaigns'}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-1">{campaigns.length}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{t('dashboard.impressions') || 'Impressions'}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-1">{fmtNum(campaigns.reduce((s, c) => s + (c.impressions || 0), 0))}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{t('dashboard.clicks') || 'Clicks'}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-1">{fmtNum(campaigns.reduce((s, c) => s + (c.clicks || 0), 0))}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{t('brand.totalSpend') || 'Total Spend'}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-1">{fmtCents(campaigns.reduce((s, c) => s + (c.spentCents || 0), 0))}</p>
                </div>
              </div>

              {/* Campaign list */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                  <h2 className="font-semibold text-[var(--text)]">{t('dashboard.adCampaigns')}</h2>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {campaigns.map((c) => {
                    const statusColors = { active: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200', draft: 'text-slate-500 bg-slate-50 dark:bg-slate-500/10 border-slate-200', paused: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200', ended: 'text-red-600 bg-red-50 dark:bg-red-500/10 border-red-200' };
                    const sc = statusColors[c.status] || statusColors.draft;
                    const ctr = c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0;
                    const isSelected = selectedCampaign === c._id;
                    return (
                      <div
                        key={String(c._id)}
                        className={`px-4 py-4 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer ${isSelected ? 'bg-[var(--bg-elevated)]' : ''}`}
                        onClick={() => setSelectedCampaign(isSelected ? null : c._id)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-[var(--text)]">{c.name}</p>
                              <span className={`px-2 py-0.5 rounded border text-xs font-medium ${sc}`}>{c.status}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--text-muted)]">
                              <span>{fmtNum(c.impressions)} {t('dashboard.impressions')}</span>
                              <span>{fmtNum(c.clicks)} {t('dashboard.clicks')}</span>
                              <span>{ctr}% CTR</span>
                              <span>{fmtCents(c.spentCents)} / {fmtCents(c.budgetCents)}</span>
                            </div>
                            {c.budgetCents > 0 && (
                              <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden max-w-xs">
                                <div
                                  className="h-full rounded-full bg-[var(--accent)]"
                                  style={{ width: `${Math.min(Math.round((c.spentCents / c.budgetCents) * 100), 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                          {c.status === 'draft' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c._id); }}
                              className="text-xs text-red-500 hover:text-red-600 font-medium"
                            >
                              {t('common.delete') || 'Delete'}
                            </button>
                          )}
                        </div>
                        {isSelected && campaignAds.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-[var(--border)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">{t('brand.adsInCampaign') || 'Ads in campaign'}</p>
                            <div className="flex flex-wrap gap-2">
                              {campaignAds.map((ad) => (
                                <span key={String(ad._id)} className="px-2 py-1 rounded-lg bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                                  {ad.title || ad.creativeUrl ? 'Ad' : 'Ad'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewCampaign && (
        <NewCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={(camp) => { setCampaigns((prev) => [camp, ...prev]); setShowNewCampaign(false); }}
        />
      )}
    </>
  );
}
