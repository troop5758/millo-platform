/**
 * Admin dashboard — dark sidebar + light main.
 * Views: Dashboard · Users · Notifications · Branding · Platform Tools
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { MilloCoin } from '../components/MilloCoin';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useStaffAuth } from '../context/StaffAuth';
import { IconAdmin, IconBack, IconKillSwitch, IconLedger, IconEconomy } from '../components/StaffIcons';
import * as api from '../sdk/dashboardsApi';
import * as legalApi from '../sdk/legalApi';
import { getToken, getUser } from '../sdk/authApi';
import { API_BASE } from '../config/api';
import { generateSecurePassword } from '../lib/passwordGenerator';
import { LANGUAGES } from '../i18n';
import i18n from '../i18n';
import { useTranslation } from 'react-i18next';
import { adminGetPricingConfig, adminSavePricingConfig, adminResetPricingField, adminGetRegions, adminSaveRegions, PRICING_DEFAULTS, formatCents } from '../sdk/pricingApi';
import { SystemConfigView } from './admin/SystemConfigView';
import {
  USER_ACCOUNT_STATUS,
  effectiveUserAccountStatus,
  accountStatusBadgeClass,
} from '../config/userAccountStatus';


const STATUS_OPEN        = 'Open';
const STATUS_IN_PROGRESS = 'In Progress';
const STATUS_DONE        = 'Done';
const STATUS_META = {
  [STATUS_OPEN]:        { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50'    },
  [STATUS_IN_PROGRESS]: { dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  [STATUS_DONE]:        { dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50'  },
};
const PRIORITY_META = {
  High:   { text: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
  Medium: { text: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  Low:    { text: 'text-[var(--text-muted)]',  bg: 'bg-slate-100', border: 'border-slate-200'  },
};

/* ─────────────────────────────────────────
   Shared helpers
───────────────────────────────────────── */
function SbIcon({ children }) {
  return (
    <span className="w-6 h-6 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:shrink-0">
      {children}
    </span>
  );
}

function AdminInput({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>}
      <input
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...props}
      />
    </div>
  );
}

function AdminToggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`flex items-center gap-3 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => { if (!disabled) onChange(!checked); }}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'} ${disabled ? 'opacity-70' : ''}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const m = STATUS_META[status] || STATUS_META[STATUS_OPEN];
  const label = status === STATUS_OPEN ? t('admin.statusOpen')
    : status === STATUS_IN_PROGRESS    ? t('admin.statusInProgress')
    : status === STATUS_DONE           ? t('admin.statusDone')
    : status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
      {label}
    </span>
  );
}
function PriorityBadge({ priority }) {
  const { t } = useTranslation();
  const m = PRIORITY_META[priority] || PRIORITY_META.Low;
  const label = priority === 'High'   ? t('admin.priorityHigh')
    : priority === 'Medium'           ? t('admin.priorityMedium')
    : priority === 'Low'              ? t('admin.priorityLow')
    : priority;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${m.bg} ${m.text} ${m.border}`}>
      {label}
    </span>
  );
}

function Flash({ msg }) {
  if (!msg.text) return null;
  return (
    <div className={`mb-4 p-4 rounded-xl text-sm font-medium ${msg.type === 'err' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
      {msg.text}
    </div>
  );
}

function useFlash() {
  const [msg, setMsg] = useState({ type: '', text: '' });
  const show = useCallback((type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 4000);
  }, []);
  return [msg, show];
}

/* ─────────────────────────────────────────
   Dashboard view
───────────────────────────────────────── */
function TasksPanel({ tasks: propTasks }) {
  const { t } = useTranslation();
  const tasks = propTasks ?? [
    { id: 1, titleKey: 'admin.task1', category: t('admin.catModeration'), assignee: t('admin.assigneeModTeam'),     status: STATUS_OPEN,        priority: 'High' },
    { id: 2, titleKey: 'admin.task2', category: t('admin.catFinance'),    assignee: t('admin.assigneeFinanceTeam'), status: STATUS_IN_PROGRESS, priority: 'High' },
    { id: 3, titleKey: 'admin.task3', category: t('admin.catSupport'),    assignee: t('admin.assigneeSupportTeam'), status: STATUS_OPEN,        priority: 'Medium' },
    { id: 4, titleKey: 'admin.task4', category: t('admin.catAds'),        assignee: t('admin.assigneeAdmin'),       status: STATUS_DONE,        priority: 'Low' },
    { id: 5, titleKey: 'admin.task5', category: t('admin.catEconomy'),    assignee: t('admin.assigneeFinanceTeam'), status: STATUS_IN_PROGRESS, priority: 'High' },
    { id: 6, titleKey: 'admin.task6', category: t('admin.catCreators'),   assignee: t('admin.assigneeAdmin'),       status: STATUS_DONE,        priority: 'Low' },
    { id: 7, titleKey: 'admin.task7', category: t('admin.catPlatform'),   assignee: t('admin.assigneeDevTeam'),     status: STATUS_OPEN,        priority: 'Medium' },
    { id: 8, titleKey: 'admin.task8', category: t('admin.catFinance'),    assignee: t('admin.assigneeFinanceTeam'), status: STATUS_DONE,        priority: 'Medium' },
  ];
  const [filter, setFilter] = useState('All');
  const counts = {
    All:               tasks.length,
    [STATUS_OPEN]:        tasks.filter((t) => t.status === STATUS_OPEN).length,
    [STATUS_IN_PROGRESS]: tasks.filter((t) => t.status === STATUS_IN_PROGRESS).length,
    [STATUS_DONE]:        tasks.filter((t) => t.status === STATUS_DONE).length,
  };
  const visible = filter === 'All' ? tasks : tasks.filter((t) => t.status === filter);
  const btns = [
    { key: 'All',            label: t('admin.filterAll'),        dot: 'bg-slate-400' },
    { key: STATUS_OPEN,        label: t('admin.statusOpen'),       dot: 'bg-red-500' },
    { key: STATUS_IN_PROGRESS, label: t('admin.statusInProgress'), dot: 'bg-yellow-400' },
    { key: STATUS_DONE,        label: t('admin.statusDone'),       dot: 'bg-green-500' },
  ];
  return (
    <div className="admin-card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-700">{t('admin.tasksHeading')}</h3>
        <div className="flex flex-wrap gap-2">
          {btns.map(({ key, label, dot }) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filter === key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
              {label} <span className="opacity-60">({counts[key]})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: t('admin.statusOpen'),       count: counts[STATUS_OPEN],        dot: 'bg-red-500',    text: 'text-red-700'    },
          { label: t('admin.statusInProgress'), count: counts[STATUS_IN_PROGRESS], dot: 'bg-yellow-400', text: 'text-yellow-700' },
          { label: t('admin.statusDone'),       count: counts[STATUS_DONE],        dot: 'bg-green-500',  text: 'text-green-700'  },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full shrink-0 ${s.dot}`} />
            <div>
              <p className={`text-xl font-bold ${s.text}`}>{s.count}</p>
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {visible.map((task) => (
          <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 hover:bg-slate-50 transition-colors">
            <span className="text-xs font-mono text-slate-400 w-8 shrink-0">#{task.id}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{task.titleKey ? t(task.titleKey) : task.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{task.category} · {task.assignee}</p>
            </div>
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-slate-400 text-center py-6">{t('admin.noTasksFilter')}</p>}
      </div>
    </div>
  );
}

function DashboardView({ staffUser }) {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [apiError,  setApiError]  = useState(false);

  useEffect(() => {
    setLoading(true);
    setApiError(false);
    api.adminGetAnalytics(staffUser)
      .then((d) => { setAnalytics(d); setApiError(false); })
      .catch(() => { setAnalytics(null); setApiError(true); })
      .finally(() => setLoading(false));
  }, [staffUser]);

  const kpis    = analytics?.kpis              ?? [];
  const chart   = analytics?.revenueChart      ?? [];
  const txs     = analytics?.recentTransactions ?? [];
  const topC    = analytics?.topCreators        ?? [];
  const liveNow = analytics?.liveNow            ?? [];
  const catData = analytics?.categoryBreakdown  ?? [];
  const tasks   = analytics?.tasks              ?? [];

  const revMax = Math.max(1, ...chart.map((d) => d.revenue));
  const revPoints = chart.map((d, i) => {
    const x = 10 + (i / Math.max(1, chart.length - 1)) * 80;
    const y = 90 - (d.revenue / revMax) * 80;
    return `${x},${y}`;
  }).join(' ');

  const totalCat = catData.reduce((s, d) => s + d.value, 0);
  const circumference = 2 * Math.PI * 40;
  let strokeOffset = 0;
  const donutSegments = catData.map((d) => {
    const length = (d.value / totalCat) * circumference;
    const seg = { ...d, dash: `${length} ${circumference}`, offset: -strokeOffset };
    strokeOffset += length;
    return seg;
  });

  return (
    <>
      {loading && (
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm mb-4">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading live data…
        </div>
      )}
      {!loading && apiError && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700 font-medium">Failed to load analytics. Check your connection or staff session.</p>
          <button type="button"
            onClick={() => { setLoading(true); setApiError(false); api.adminGetAnalytics(staffUser).then(setAnalytics).catch(() => setApiError(true)).finally(() => setLoading(false)); }}
            className="shrink-0 text-xs font-semibold text-red-700 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.length === 0 && !loading && !apiError ? (
          <div className="col-span-4 text-center py-8 text-slate-400 text-sm">{t('admin.noAnalyticsData')}</div>
        ) : kpis.map((k) => (
          <div key={k.label} className="admin-card">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{k.label}</p>
            <p className="admin-kpi-value mt-1">{k.value}</p>
            <p className="admin-kpi-change mt-1"><span aria-hidden>▲</span> {k.change}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="admin-card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Revenue (30 days)</h3>
          <div className="h-48">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={revPoints} />
              <polygon fill="rgba(37,99,235,0.15)" points={`10,90 ${revPoints} 90,90`} />
            </svg>
          </div>
          <div className="flex justify-between mt-1 text-xs text-[var(--text-muted)] overflow-hidden">
            {chart.filter((_, i) => i % Math.ceil(chart.length / 7) === 0).map((d) => (
              <span key={d.label || d.date}>{d.label || (d.date || '').slice(5)}</span>
            ))}
          </div>
        </div>
        <div className="admin-card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Content breakdown</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-36 h-36 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {donutSegments.map((d, i) => (
                  <circle key={i} cx="50" cy="50" r="40" fill="none"
                    stroke={d.color} strokeWidth="18"
                    strokeDasharray={d.dash} strokeDashoffset={d.offset} />
                ))}
              </svg>
            </div>
            <ul className="space-y-2">
              {catData.map((d) => (
                <li key={d.name} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  {d.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="admin-card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Transactions</h3>
          <table className="admin-table w-full">
            <thead><tr><th>ID</th><th>User</th><th>Date</th><th>Amount</th><th>Type</th></tr></thead>
            <tbody>
              {txs.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.id}</td>
                  <td className="truncate max-w-[120px]">{r.userId}</td>
                  <td>{r.date}</td>
                  <td>{r.amount}</td>
                  <td className="text-xs text-[var(--text-muted)]">{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Top Creators (30d)</h3>
          {topC.length > 0
            ? (
              <table className="admin-table w-full">
                <thead><tr><th>#</th><th>Creator</th><th>Revenue</th></tr></thead>
                <tbody>
                  {topC.map((c) => (
                    <tr key={c.userId}>
                      <td>{c.rank}</td>
                      <td className="font-mono text-xs truncate max-w-[140px]">{c.userId}</td>
                      <td>{c.revenue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : <p className="text-sm text-slate-400">{t('admin.noRevenueData')}</p>
          }
          {liveNow.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Live now</h4>
              <ul className="space-y-1">
                {liveNow.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{s.title}</span>
                    <span className="shrink-0 ml-2 text-xs text-slate-400">{s.viewers} viewers</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <TasksPanel tasks={tasks} />
    </>
  );
}

/* ─────────────────────────────────────────
   Branding view
───────────────────────────────────────── */
function BrandingView({ staffUser }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ logoUrl: '', appName: '', appUrl: '', accentColor: '#2563eb', supportEmail: '' });
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [previewHtml, setPreview] = useState('');
  const [msg, showMsg]            = useFlash();
  const previewTimer              = useRef(null);

  useEffect(() => {
    api.adminGetBranding(staffUser)
      .then((d) => setForm({ logoUrl: d.logoUrl || '', appName: d.appName || '', appUrl: d.appUrl || '', accentColor: d.accentColor || '#2563eb', supportEmail: d.supportEmail || '' }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [staffUser]);

  const handleChange = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => refreshPreview(next), 600);
  };

  const refreshPreview = useCallback(async (values) => {
    try {
      const html = await api.adminEmailPreview(staffUser, {
        logoUrl:     values.logoUrl,
        appName:     values.appName,
        accentColor: values.accentColor,
      });
      setPreview(html);
    } catch { /* preview failure is non-critical */ }
  }, [staffUser]);

  useEffect(() => { if (!loading) refreshPreview(form); }, [loading]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminSaveBranding(staffUser, form);
      showMsg('ok', 'Branding saved — emails will use updated logo and colors.');
    } catch (err) {
      showMsg('err', err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-slate-400 text-sm p-4">{t('admin.loading')}</div>;

  return (
    <div className="space-y-6">
      <Flash msg={msg} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Settings form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="admin-card space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-800">Platform Branding</h2>
            </div>
            <AdminInput label="Logo URL" placeholder="https://example.com/logo.png" value={form.logoUrl} onChange={(e) => handleChange('logoUrl', e.target.value)} />
            <AdminInput label="App Name" placeholder="Millo" value={form.appName} onChange={(e) => handleChange('appName', e.target.value)} />
            <AdminInput label="App URL" placeholder="https://milloapp.com" type="url" value={form.appUrl} onChange={(e) => handleChange('appUrl', e.target.value)} />
            <AdminInput label="Support Email" placeholder="support@milloapp.com" type="email" value={form.supportEmail} onChange={(e) => handleChange('supportEmail', e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Accent Color (email CTA)</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.accentColor} onChange={(e) => handleChange('accentColor', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
                <input type="text" value={form.accentColor} onChange={(e) => handleChange('accentColor', e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 font-mono" />
              </div>
            </div>
          </div>

          {/* Logo preview */}
          {form.logoUrl && (
            <div className="admin-card">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Logo preview</p>
              <img src={form.logoUrl} alt="Logo preview" className="h-12 w-auto object-contain rounded"
                onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
        </form>

        {/* Live email preview */}
        <div className="admin-card flex flex-col">
          <p className="text-sm font-semibold text-slate-700 mb-3">Email Template Preview</p>
          <p className="text-xs text-slate-400 mb-3">Updates as you type. This is how every email sent by the platform will look.</p>
          {previewHtml ? (
            <div className="flex-1 rounded-xl overflow-hidden border border-slate-200" style={{ minHeight: 320 }}>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="w-full"
                style={{ height: 420, border: 'none' }}
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm" style={{ minHeight: 320 }}>
              Fill in the form to see a live preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Notifications view
───────────────────────────────────────── */
function makeEmailTypes(t) {
  return ['welcome', 'purchase', 'payout', 'security', 'marketing'].map((key) => ({
    key,
    label: t(`admin.notifications.emailTypes.${key}.label`),
    desc:  t(`admin.notifications.emailTypes.${key}.desc`),
  }));
}
function makePushTypes(t) {
  return ['newFollower', 'newGift', 'liveStart', 'message'].map((key) => ({
    key,
    label: t(`admin.notifications.pushTypes.${key}.label`),
    desc:  t(`admin.notifications.pushTypes.${key}.desc`),
  }));
}

function NotificationsView({ staffUser }) {
  const { t } = useTranslation();
  const EMAIL_TYPES = makeEmailTypes(t);
  const PUSH_TYPES  = makePushTypes(t);
  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testTo,   setTestTo]   = useState('');
  const [sending,  setSending]  = useState(false);
  const [msg, showMsg]          = useFlash();
  const [emailLive, setEmailLive] = useState(false);

  useEffect(() => {
    api.adminGetNotifSettings(staffUser)
      .then(setSettings)
      .catch(() => setSettings({ emailTypes: {}, pushTypes: {} }))
      .finally(() => setLoading(false));
  }, [staffUser]);

  useEffect(() => {
    fetch(`${API_BASE}/api/system/capabilities`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setEmailLive(!!d?.capabilities?.notifications?.email))
      .catch(() => setEmailLive(false));
  }, []);

  const toggle = (section, key) => {
    setSettings((s) => {
      if (key == null) return { ...s, [section]: !s[section] };
      return { ...s, [section]: { ...s[section], [key]: !s[section]?.[key] } };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adminSaveNotifSettings(staffUser, settings);
      showMsg('ok', 'Notification settings saved.');
    } catch (err) {
      showMsg('err', err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!emailLive) {
      showMsg('err', 'Email delivery is disabled (no real EMAIL_PROVIDER).');
      return;
    }
    if (!testTo.trim()) return;
    setSending(true);
    try {
      await api.adminTestEmail(staffUser, testTo.trim(), 'Test email from Millo Admin');
      showMsg('ok', `Test email sent to ${testTo}`);
      setTestTo('');
    } catch (err) {
      showMsg('err', err.message || 'Send failed — check your email configuration');
    } finally { setSending(false); }
  };

  if (loading) return <div className="text-slate-400 text-sm p-4">{t('admin.loading')}</div>;

  const et = settings?.emailTypes || {};
  const pt = settings?.pushTypes  || {};

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Flash msg={msg} />

      {/* Email notifications — disabled in UI when capabilities.notifications.email is false */}
      <div className={`admin-card space-y-5 ${!emailLive ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800">Email Notifications</h2>
          </div>
        {!emailLive && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Email delivery is off: set a real <code className="text-[11px]">EMAIL_PROVIDER</code> (not <code className="text-[11px]">console</code>) and provider credentials. See GET /api/system/capabilities.
          </p>
        )}
        <div className="space-y-3">
          {EMAIL_TYPES.map(({ key, label, desc }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>
              </div>
              <AdminToggle checked={et[key] !== false} onChange={() => toggle('emailTypes', key)} label="" disabled={!emailLive} />
            </div>
          ))}
        </div>
      </div>

      {/* Push notifications — Phase 3: admin master toggle removed */}
      <div className="admin-card space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800">Push Notifications</h2>
          </div>
        <div className="space-y-3">
          {PUSH_TYPES.map(({ key, label, desc }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>
              </div>
              <AdminToggle checked={pt[key] !== false} onChange={() => toggle('pushTypes', key)} label="" />
            </div>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors">
        {saving ? 'Saving…' : 'Save Notification Settings'}
      </button>

      {/* Test email */}
      <div className={`admin-card ${!emailLive ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-800">Send Test Email</h2>
        </div>
        <form onSubmit={handleTestEmail} className="flex gap-2">
          <input type="email" placeholder="recipient@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} required
            disabled={!emailLive}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" />
          <button type="submit" disabled={sending || !emailLive}
            className="px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Sends a rendered test email using the current branding settings. Requires a real email transporter configured in the API.</p>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   Users view
───────────────────────────────────────── */
function UsersView({ staffUser }) {
  const [q,         setQ]         = useState('');
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [actioning, setActioning] = useState(false);
  const [msg,       showMsg]      = useFlash();
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const LIMIT = 25;

  // Initial load + search
  const doSearch = React.useCallback(async (newQ = q, pg = 1) => {
    setLoading(true);
    try {
      const results = await api.adminSearchUsers(staffUser, newQ, pg, LIMIT);
      const list = Array.isArray(results) ? results : (results?.users || []);
      if (pg === 1) setUsers(list);
      else setUsers((prev) => [...prev, ...list]);
      setHasMore(list.length === LIMIT);
      setPage(pg);
    } catch (e) {
      setUsers([]);
      showMsg('err', e.message || 'Failed to load users');
    }
    setLoading(false);
  }, [staffUser, q]);

  React.useEffect(() => { doSearch('', 1); }, [staffUser]);

  const filtered = users; // server-side filtering

  const handleSearch = async (e) => {
    e.preventDefault();
    doSearch(q, 1);
  };

  const handleAction = async (action, userId) => {
    setActioning(true);
    try {
      const out = await api.adminUserAction(staffUser, userId, action);
      setUsers((us) => us.map((u) => {
        const id = String(u.id || u._id);
        if (id !== String(userId)) return u;
        if (action === 'ban') {
          return { ...u, status: out?.status || USER_ACCOUNT_STATUS.BANNED, flags: { ...u.flags, suspended: true } };
        }
        if (action === 'unban') {
          return { ...u, status: out?.status || USER_ACCOUNT_STATUS.ACTIVE, flags: { ...u.flags, suspended: false } };
        }
        return u;
      }));
      showMsg('ok', `User ${action} successful`);
      setSelected(null);
    } catch (err) {
      showMsg('err', err.message || `${action} failed`);
    } finally { setActioning(false); }
  };

  return (
    <div className="space-y-6">
      <Flash msg={msg} />

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input type="search" placeholder="Search by name, email, or user ID…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" className="px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors">
          Search
        </button>
      </form>

      {/* Users table */}
      <div className="admin-card overflow-x-auto">
        {loading && users.length === 0 ? (
          <div className="py-12 flex justify-center">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <p className="font-medium mb-1">No users found</p>
            <p className="text-sm">{q ? `No results for "${q}"` : 'No users in the platform yet.'}</p>
          </div>
        ) : (
        <table className="admin-table w-full">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Balance</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const acctStatus = effectiveUserAccountStatus(u);
              const stMeta = accountStatusBadgeClass(acctStatus);
              return (
              <tr key={u.id || u._id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(u)}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                      {(u.name || u.email || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 text-sm">{u.name || u.displayName || '—'}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="capitalize text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">{u.role || 'viewer'}</span>
                </td>
                <td>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${stMeta.bg} ${stMeta.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot}`} />
                    {acctStatus}
                  </span>
                </td>
                <td>
                  <span className="text-sm font-medium text-amber-600 flex items-center gap-1"><MilloCoin size={15} /> {(u.balance ?? u.balanceCents ?? 0).toLocaleString()}</span>
                </td>
                <td><span className="text-xs text-[var(--text-muted)]">{u.joined || (u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—')}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {acctStatus === USER_ACCOUNT_STATUS.ACTIVE ? (
                      <button type="button" disabled={actioning}
                        onClick={() => handleAction('ban', u.id || u._id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50">
                        Ban
                      </button>
                    ) : (
                      <button type="button" disabled={actioning}
                        onClick={() => handleAction('unban', u.id || u._id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50">
                        {acctStatus === USER_ACCOUNT_STATUS.BANNED ? 'Unban' : 'Reinstate'}
                      </button>
                    )}
                    <button type="button" onClick={() => setSelected(u)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                      View
                    </button>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        )}
        {hasMore && !loading && (
          <div className="pt-3 pb-1 flex justify-center border-t border-slate-100">
            <button type="button" onClick={() => doSearch(q, page + 1)}
              className="text-xs font-semibold text-blue-600 hover:underline">
              Load more
            </button>
          </div>
        )}
      </div>

      {/* User detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 shadow-2xl z-10">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-lg font-bold">
                  {(selected.name || selected.displayName || selected.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{selected.name || selected.displayName || '—'}</p>
                  <p className="text-sm text-[var(--text-muted)]">{selected.email}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'User ID',  value: selected.id || selected._id },
                { label: 'Role',     value: selected.role },
                { label: 'Status',   value: effectiveUserAccountStatus(selected) },
                { label: 'Coins',    value: (selected.balance ?? 0).toLocaleString() },
                { label: 'Joined',   value: selected.joined },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-800 capitalize">{value != null ? String(value) : '—'}</p>
                </div>
              ))}
            </dl>
            <div className="flex gap-2">
              {effectiveUserAccountStatus(selected) === USER_ACCOUNT_STATUS.ACTIVE ? (
                <button type="button" disabled={actioning} onClick={() => handleAction('ban', selected.id || selected._id)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors">
                  {actioning ? 'Processing…' : 'Ban User'}
                </button>
              ) : (
                <button type="button" disabled={actioning} onClick={() => handleAction('unban', selected.id || selected._id)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors">
                  {actioning ? 'Processing…' : (effectiveUserAccountStatus(selected) === USER_ACCOUNT_STATUS.BANNED ? 'Unban User' : 'Reinstate account')}
                </button>
              )}
              <button type="button" disabled={actioning} onClick={() => handleAction('resetPassword', selected.id || selected._id)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 transition-colors">
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Translations view
───────────────────────────────────────── */
function TranslationsView() {
  const [lang, setLang]       = useState('en');
  const [search, setSearch]   = useState('');
  const [edits, setEdits]     = useState({});
  const [saved, setSaved]     = useState(false);
  const [importErr, setImportErr] = useState('');

  /* Flatten nested JSON to dot-key pairs */
  function flatten(obj, prefix = '') {
    return Object.entries(obj).reduce((acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(acc, flatten(v, key));
      } else {
        acc[key] = String(v);
      }
      return acc;
    }, {});
  }

  const baseFlat  = flatten(i18n.getResourceBundle('en', 'translation') || {});
  const langFlat  = flatten(i18n.getResourceBundle(lang, 'translation') || {});

  const allKeys   = Object.keys(baseFlat);
  const filtered  = search.trim()
    ? allKeys.filter((k) => k.toLowerCase().includes(search.toLowerCase()) || (langFlat[k] || '').toLowerCase().includes(search.toLowerCase()))
    : allKeys;

  const getValue  = (key) => (edits[key] !== undefined ? edits[key] : (langFlat[key] || ''));

  const handleChange = (key, val) => setEdits((e) => ({ ...e, [key]: val }));

  const handleSave = () => {
    /* Apply edits to i18n resource bundle in memory */
    const bundle = i18n.getResourceBundle(lang, 'translation') || {};
    const updated = unflatten({ ...langFlat, ...edits });
    i18n.addResourceBundle(lang, 'translation', updated, true, true);
    setEdits({});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleExport = () => {
    const merged = { ...langFlat, ...edits };
    const blob = new Blob([JSON.stringify(unflatten(merged), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${lang}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const flat = flatten(parsed);
        setEdits((prev) => ({ ...prev, ...flat }));
        setImportErr('');
      } catch { setImportErr('Invalid JSON file — please check the format.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  function unflatten(flat) {
    const result = {};
    for (const [dotKey, val] of Object.entries(flat)) {
      const parts = dotKey.split('.');
      let cur = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = val;
    }
    return result;
  }

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="admin-card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800">Translations</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Edit platform text per language. Changes apply instantly in-browser.</p>
          </div>
          {saved && <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">Saved!</span>}
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Language selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" onClick={() => { setLang(l.code); setEdits({}); }}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ' +
                  (lang === l.code ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                <span>{l.flag}</span>
                <span>{l.code.toUpperCase()}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 relative min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input type="search" placeholder="Search translation keys…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleExport}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors">
              Export JSON
            </button>
            <label className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer">
              Import JSON
              <input type="file" accept=".json" className="sr-only" onChange={handleImport} />
            </label>
            {hasEdits && (
              <button type="button" onClick={handleSave}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
                Save All ({Object.keys(edits).length})
              </button>
            )}
          </div>
        </div>
      </div>

      {importErr && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="flex-1">{importErr}</span>
          <button type="button" onClick={() => setImportErr('')} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Translation table */}
      <div className="admin-card overflow-x-auto">
        <p className="text-xs text-[var(--text-muted)] mb-3">{filtered.length} keys {search ? `matching "${search}"` : 'total'}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide w-2/5">Key</th>
              <th className="text-left py-2 px-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide w-1/4">English (base)</th>
              <th className="text-left py-2 px-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                {LANGUAGES.find((l) => l.code === lang)?.flag} {lang.toUpperCase()} Translation
                {lang === 'en' && <span className="ml-1 text-slate-400">(editing source)</span>}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 150).map((key) => {
              const isEdited = edits[key] !== undefined;
              return (
                <tr key={key} className={`hover:bg-slate-50 ${isEdited ? 'bg-blue-50/50' : ''}`}>
                  <td className="py-2 px-2 font-mono text-xs text-[var(--text-muted)] align-top pt-3">{key}</td>
                  <td className="py-2 px-2 text-xs text-[var(--text-muted)] align-top pt-3 max-w-[180px]">
                    <span className="break-words">{baseFlat[key] || ''}</span>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={getValue(key)}
                      onChange={(e) => handleChange(key, e.target.value)}
                      dir={lang === 'ar' ? 'rtl' : 'ltr'}
                      className={`w-full rounded-md border px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isEdited ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="py-8 text-center text-slate-400 text-sm">No keys match your search.</td></tr>
            )}
            {filtered.length > 150 && (
              <tr><td colSpan={3} className="py-3 text-center text-slate-400 text-xs">Showing first 150 of {filtered.length} keys. Refine search to see more.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Fraud Dashboard view
───────────────────────────────────────── */
const ALERT_TYPE_LABELS = {
  gift_velocity: 'Gift velocity',
  device_farm:   'Device farm',
  payment_risk: 'Payment risk',
  bot_viewer:    'Bot viewer',
};
const ALERT_TYPE_COLORS = {
  gift_velocity: 'bg-amber-50 text-amber-700 border-amber-200',
  device_farm:   'bg-red-50 text-red-700 border-red-200',
  payment_risk:  'bg-orange-50 text-orange-700 border-orange-200',
  bot_viewer:    'bg-purple-50 text-purple-700 border-purple-200',
};

function FraudView({ staffUser }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [msg, showMsg] = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetFraudAlerts(staffUser, { limit: 100 });
      setAlerts(Array.isArray(data) ? data : []);
    } catch (e) { showMsg('err', e.message || 'Failed to load fraud alerts'); setAlerts([]); }
    setLoading(false);
  }, [staffUser]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.alertType === filter);

  return (
    <div>
      <Flash msg={msg} />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Fraud Alerts</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'gift_velocity', 'device_farm', 'payment_risk', 'bot_viewer'].map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${filter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {f === 'all' ? 'All' : ALERT_TYPE_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          Fraud signals <TrustBadge feature="fraudProtection" />
        </span>
        <span className="flex items-center gap-1.5">
          Payments <TrustBadge feature="payments" />
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[var(--text-muted)] text-sm">No fraud alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2 py-0.5 rounded border text-xs font-medium ${ALERT_TYPE_COLORS[a.alertType] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {ALERT_TYPE_LABELS[a.alertType] || a.alertType}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.action === 'block' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {a.action}
                    </span>
                    {a.riskScore != null && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs">Risk: {a.riskScore}</span>
                    )}
                  </div>
                  {a.userId && (
                    <p className="text-sm text-slate-600 mb-1">
                      User: <span className="font-mono text-slate-800">{a.userId}</span>
                      {a.refId && <span className="text-slate-400 ml-2">Ref: {a.refId}</span>}
                    </p>
                  )}
                  {a.alertType === 'device_farm' && a.meta?.accountCount && (
                    <p className="text-sm text-slate-600 mb-1">{a.meta.accountCount} accounts on same device</p>
                  )}
                  {a.signals?.length > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">Signals: {a.signals.join(', ')}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}
                  </p>
                </div>
                {a.userId && (
                  <Link to={`/admin?view=users&userId=${a.userId}`} className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors">
                    View user
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Platform Tools view (existing)
───────────────────────────────────────── */
function PlatformToolsView({ staffUser }) {
  const [killState, setKillState]   = useState({ ads: null, milla: null, filters: null });
  const [togglesLoaded, setTogglesLoaded] = useState(false);
  const [ledgerUserId, setLedgerUserId] = useState('');
  const [ledger, setLedger]         = useState(null);
  const [ledgerError, setLedgerError] = useState('');
  const [economyUserId, setEconomyUserId] = useState('');
  const [balance, setBalance]       = useState(null);
  const [financialPayload, setFinancialPayload] = useState({ userId: '', amountCents: '', reason: '', refId: '' });
  const [financialAction, setFinancialAction] = useState('credit');
  const [anomalies, setAnomalies]   = useState(null);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [msg, showMsg]              = useFlash();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api.adminGetFeatureToggles(staffUser);
        if (cancelled || !t) return;
        setKillState({ ads: !!t.ads, milla: !!t.milla, filters: !!t.filters });
      } catch {
        if (!cancelled) setKillState({ ads: null, milla: null, filters: null });
      } finally {
        if (!cancelled) setTogglesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [staffUser]);

  const handleKillSwitch = async (which, enabled) => {
    try {
      await api.adminFeatureToggle(staffUser, which, enabled);
      setKillState((s) => ({ ...s, [which]: enabled }));
      showMsg('ok', `${which} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e) { showMsg('err', e.message || 'Failed'); }
  };

  const handleLedger = async (e) => {
    e.preventDefault();
    setLedgerError(''); setLedger(null);
    if (!ledgerUserId.trim()) return;
    try {
      setLedger(await api.adminLedger(staffUser, ledgerUserId.trim(), 50));
    } catch (e) { setLedgerError(e.message || 'Failed to load ledger'); }
  };

  const handleEconomyBalance = async (e) => {
    e.preventDefault();
    if (!economyUserId.trim()) return;
    try {
      const out = await api.adminEconomy(staffUser, 'getBalance', { userId: economyUserId.trim() });
      setBalance(out.balanceCents);
    } catch (e) { showMsg('err', e.message || 'Failed'); }
  };

  const handleFinancialOps = async (e) => {
    e.preventDefault();
    const userId = financialPayload.userId.trim();
    const amountCents = parseInt(financialPayload.amountCents, 10);
    if (!userId || !Number.isFinite(amountCents) || amountCents <= 0) {
      showMsg('err', 'Valid userId and amount required'); return;
    }
    try {
      await api.adminFinancialOps(staffUser, financialAction, { userId, amountCents, reason: financialPayload.reason || undefined, refId: financialPayload.refId || undefined });
      showMsg('ok', `${financialAction} completed`);
      setFinancialPayload({ ...financialPayload, amountCents: '', reason: '', refId: '' });
    } catch (e) { showMsg('err', e.message || 'Failed'); }
  };

  const handleLoadAnomalies = async () => {
    setAnomaliesLoading(true);
    try {
      const out = await api.adminGetAnomalies(staffUser, 7);
      setAnomalies(out);
    } catch (e) { showMsg('err', e.message || 'Failed to load anomalies'); setAnomalies(null); }
    setAnomaliesLoading(false);
  };

  return (
    <div className="space-y-6">
      <Flash msg={msg} />

      <div className="admin-card">
            <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <IconKillSwitch className="w-5 h-5" />
              </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Feature toggles</h2>
            <p className="text-xs text-slate-500 mt-0.5">RBAC: admin, support, or ops. Persisted (PlatformSettings) and applied to the API process.</p>
          </div>
            </div>
            {!togglesLoaded && <p className="text-sm text-slate-500 mb-3">Loading current state…</p>}
            <div className={`flex flex-wrap gap-4 ${!togglesLoaded ? 'opacity-60 pointer-events-none' : ''}`}>
              {['ads', 'milla', 'filters'].map((which) => (
                <div key={which} className="flex items-center gap-2">
              <span className="text-sm text-slate-600 capitalize w-14">{which}</span>
              <button type="button" onClick={() => handleKillSwitch(which, true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${killState[which] === true ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-blue-50'}`}>On</button>
              <button type="button" onClick={() => handleKillSwitch(which, false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${killState[which] === false ? 'border-slate-400 bg-slate-200 text-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Off</button>
                </div>
              ))}
            </div>
      </div>

      <div className="admin-card">
            <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <IconLedger className="w-5 h-5" />
              </div>
          <h2 className="text-base font-semibold text-slate-800">Ledger View</h2>
            </div>
            <form onSubmit={handleLedger} className="flex gap-2 flex-wrap">
          <input type="text" placeholder="User ID" value={ledgerUserId} onChange={(e) => setLedgerUserId(e.target.value)}
            className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800" />
          <button type="submit" className="px-5 py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700">Load</button>
            </form>
        {ledgerError && <p className="mt-2 text-sm text-red-600">{ledgerError}</p>}
            {ledger && (
          <ul className="mt-4 space-y-2 max-h-64 overflow-auto text-sm text-slate-600 divide-y divide-slate-100">
                {ledger.map((entry, i) => (
              <li key={entry._id || i} className="py-1.5">{entry.sequence} — {entry.type}{entry.amountCents != null ? ` ${entry.amountCents}¢` : ''}</li>
                ))}
              </ul>
            )}
      </div>

      <div className="admin-card">
            <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <IconEconomy className="w-5 h-5" />
              </div>
          <h2 className="text-base font-semibold text-slate-800">Economy — Get Balance</h2>
            </div>
            <form onSubmit={handleEconomyBalance} className="flex gap-2 flex-wrap">
          <input type="text" placeholder="User ID" value={economyUserId} onChange={(e) => setEconomyUserId(e.target.value)}
            className="flex-1 min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800" />
          <button type="submit" className="px-5 py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700">Get balance</button>
            </form>
        {balance != null && (
          <p className="mt-3 font-semibold text-slate-800">
            Balance: <span className="text-amber-600">{balance}¢</span> ({(balance / 100).toFixed(2)} coins)
          </p>
        )}
      </div>

      <div className="admin-card">
            <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <IconEconomy className="w-5 h-5" />
              </div>
          <h2 className="text-base font-semibold text-slate-800">Financial Ops — Credit / Debit</h2>
            </div>
            <form onSubmit={handleFinancialOps} className="space-y-3">
              <div className="flex gap-4">
            {['credit', 'debit'].map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-slate-700 cursor-pointer capitalize">
                <input type="radio" name="fa" checked={financialAction === opt} onChange={() => setFinancialAction(opt)} className="accent-blue-600" />
                {opt}
                </label>
            ))}
              </div>
          <AdminInput placeholder="User ID" value={financialPayload.userId} onChange={(e) => setFinancialPayload({ ...financialPayload, userId: e.target.value })} />
          <AdminInput type="number" placeholder="Amount (cents)" value={financialPayload.amountCents} onChange={(e) => setFinancialPayload({ ...financialPayload, amountCents: e.target.value })} />
          <AdminInput placeholder="Reason (optional)" value={financialPayload.reason} onChange={(e) => setFinancialPayload({ ...financialPayload, reason: e.target.value })} />
          <AdminInput placeholder="Ref ID (optional)" value={financialPayload.refId} onChange={(e) => setFinancialPayload({ ...financialPayload, refId: e.target.value })} />
          <button type="submit" className="px-5 py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700">Submit</button>
            </form>
      </div>

      <div className="admin-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Financial Anomaly Alerts</h2>
          <button type="button" onClick={handleLoadAnomalies} disabled={anomaliesLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50">
            {anomaliesLoading ? 'Loading…' : 'Check anomalies'}
          </button>
        </div>
        {anomalies && (
          <div className="space-y-3 text-sm">
            {anomalies.summary && (
              <p className="text-slate-600">
                {anomalies.summary.alertCount} alert(s) in last {anomalies.summary.lookbackDays} days
                {anomalies.summary.bySeverity?.high > 0 && <span className="ml-2 text-red-600 font-medium">{anomalies.summary.bySeverity.high} high</span>}
              </p>
            )}
            {anomalies.alerts?.length ? anomalies.alerts.map((a, i) => (
              <div key={i} className={`p-3 rounded-lg border ${a.severity === 'high' ? 'border-red-200 bg-red-50' : a.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="font-medium text-slate-800">{a.type.replace(/_/g, ' ')} — {a.message}</p>
                {a.items?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-slate-600 max-h-32 overflow-auto">
                    {a.items.slice(0, 5).map((it, j) => (
                      <li key={j} className="text-xs">{it.userId || it.actorId || it.id} — {it.grossAmountCents != null ? `$${(it.grossAmountCents / 100).toFixed(2)}` : it.amountCents != null ? `$${(it.amountCents / 100).toFixed(2)}` : it.transactionCount ?? ''}</li>
                    ))}
                    {a.items.length > 5 && <li className="text-xs text-[var(--text-muted)]">… +{a.items.length - 5} more</li>}
                  </ul>
                )}
              </div>
            )) : !anomaliesLoading && <p className="text-[var(--text-muted)]">No anomalies detected.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Pricing view
───────────────────────────────────────── */
function PricingView({ staffUser }) {
  const [cfg, setCfg]               = useState(null);
  const [regionData, setRegionData] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('coinPacks');
  const [dirty, setDirty]           = useState({});
  const [regionDirty, setRegionDirty] = useState({});
  const [msg, showMsg]              = useFlash();

  useEffect(() => {
    setLoading(true);
    Promise.all([adminGetPricingConfig(), adminGetRegions()])
      .then(([pRes, rRes]) => {
        setCfg(pRes.config ?? PRICING_DEFAULTS);
        setRegionData(rRes);
        setLoading(false);
      })
      .catch(() => { setCfg(PRICING_DEFAULTS); setLoading(false); });
  }, []);

  const patch = (field, value) => {
    setCfg((prev) => ({ ...prev, [field]: value }));
    setDirty((d) => ({ ...d, [field]: value }));
  };

  const save = async () => {
    if (!Object.keys(dirty).length) { showMsg('ok', 'Nothing changed'); return; }
    try {
      await adminSavePricingConfig(dirty);
      setDirty({});
      showMsg('ok', 'Pricing saved');
    } catch (e) { showMsg('err', e.message || 'Save failed'); }
  };

  const saveRegions = async () => {
    if (!Object.keys(regionDirty).length) { showMsg('ok', 'Nothing changed'); return; }
    try {
      await adminSaveRegions(regionDirty);
      setRegionDirty({});
      showMsg('ok', 'Regional pricing saved');
    } catch (e) { showMsg('err', e.message || 'Save failed'); }
  };

  const patchTierMultiplier = (tierId, value) => {
    const updated = { ...(regionData?.tiers ?? {}), [tierId]: { ...(regionData?.tiers?.[tierId] ?? {}), multiplier: parseFloat(value) } };
    setRegionData((r) => ({ ...r, tiers: updated }));
    setRegionDirty((d) => ({ ...d, tiers: updated }));
  };

  const patchFx = (currency, value) => {
    const updated = { ...(regionData?.fx ?? {}), [currency]: parseFloat(value) };
    setRegionData((r) => ({ ...r, fx: updated }));
    setRegionDirty((d) => ({ ...d, fx: updated }));
  };

  const reset = async (field) => {
    try {
      await adminResetPricingField(field);
      setCfg((prev) => ({ ...prev, [field]: PRICING_DEFAULTS[field] }));
      showMsg('ok', `${field} reset to default`);
    } catch (e) { showMsg('err', e.message || 'Reset failed'); }
  };

  const patchGiftCost = (giftId, val) => {
    const newCosts = { ...(cfg?.giftCosts ?? {}), [giftId]: Number(val) };
    patch('giftCosts', newCosts);
  };

  const patchPackField = (packId, field, val) => {
    const packs = (cfg?.coinPacks ?? []).map((p) =>
      p.id === packId ? { ...p, [field]: field === 'popular' ? val : Number(val) } : p
    );
    patch('coinPacks', packs);
  };

  const patchTierField = (tierId, field, val) => {
    const tiers = (cfg?.subscriptionTiers ?? []).map((t) =>
      t.id === tierId ? { ...t, [field]: Number(val) } : t
    );
    patch('subscriptionTiers', tiers);
  };

  const TABS = [
    { id: 'coinPacks',         label: 'Coin Packs' },
    { id: 'giftCosts',         label: 'Gift Costs' },
    { id: 'subscriptionTiers', label: 'Subscriptions' },
    { id: 'splits',            label: 'Revenue Splits' },
    { id: 'regions',           label: 'Regional Pricing' },
  ];

  const GIFT_IDS = ['rose','ice-cream','lollipop','diamond','trophy','crown','rocket','galaxy','dragon','lion','universe','millo-star'];

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Loading pricing config…</div>;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pricing Configuration</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">All changes apply live without server restart</p>
        </div>
        <div className="flex items-center gap-3">
          {(tab !== 'regions' && Object.keys(dirty).length > 0) && (
            <span className="text-xs text-amber-600 font-medium">{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length > 1 ? 's' : ''}</span>
          )}
          {(tab === 'regions' && Object.keys(regionDirty).length > 0) && (
            <span className="text-xs text-amber-600 font-medium">{Object.keys(regionDirty).length} unsaved change{Object.keys(regionDirty).length > 1 ? 's' : ''}</span>
          )}
          <button type="button" onClick={tab === 'regions' ? saveRegions : save}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
            Save Changes
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mb-5 px-4 py-2.5 rounded-lg text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-muted)] hover:text-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Coin Packs ── */}
      {tab === 'coinPacks' && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-4">Set the price and bonus coins for each pack. <span className="font-medium">priceCents</span> is in USD cents (99 = $0.99).</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Pack', 'Base Coins', 'Bonus Coins', 'Price (cents)', 'Best Deal?', 'Total'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(cfg.coinPacks ?? []).map((pack) => (
                  <tr key={pack.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 capitalize">{pack.label || pack.id}</td>
                    <td className="px-4 py-3">
                      <input type="number" min="1" value={pack.coins}
                        onChange={(e) => patchPackField(pack.id, 'coins', e.target.value)}
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min="0" value={pack.bonusCoins}
                        onChange={(e) => patchPackField(pack.id, 'bonusCoins', e.target.value)}
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min="1" value={pack.priceCents}
                        onChange={(e) => patchPackField(pack.id, 'priceCents', e.target.value)}
                        className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                      <span className="ml-2 text-slate-400 text-xs">{formatCents(pack.priceCents)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={!!pack.popular}
                        onChange={(e) => patchPackField(pack.id, 'popular', e.target.checked)}
                        className="w-4 h-4 accent-blue-600" />
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {(pack.coins + pack.bonusCoins).toLocaleString()} coins
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => reset('coinPacks')}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline">
            Reset to defaults
          </button>
        </div>
      )}

      {/* ── Gift Costs ── */}
      {tab === 'giftCosts' && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-4">Set the coin cost for each virtual gift. Changes apply immediately to the gift panel.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {GIFT_IDS.map((id) => (
              <div key={id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-700 capitalize mb-2">{id.replace('-', ' ')}</div>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" value={cfg.giftCosts?.[id] ?? ''}
                    onChange={(e) => patchGiftCost(id, e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-slate-400 text-xs shrink-0">coins</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Default: {PRICING_DEFAULTS.giftCosts[id] ?? '—'}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => reset('giftCosts')}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline">
            Reset all gift costs to defaults
          </button>
        </div>
      )}

      {/* ── Subscription Tiers ── */}
      {tab === 'subscriptionTiers' && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-4">Prices in <span className="font-medium">USD cents</span> (999 = $9.99). Annual discount is calculated automatically on the pricing page.</p>
          <div className="space-y-4">
            {(cfg.subscriptionTiers ?? []).map((tier) => (
              <div key={tier.id} className={`bg-white border-2 rounded-xl p-5 ${tier.highlight ? 'border-blue-400' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-bold text-slate-800">{tier.name}</span>
                  {tier.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{tier.badge}</span>}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <AdminInput
                    label="Monthly Price (cents)"
                    type="number" min="0"
                    value={tier.priceMonthly}
                    onChange={(v) => patchTierField(tier.id, 'priceMonthly', v)}
                    hint={formatCents(tier.priceMonthly) + '/mo'}
                  />
                  <AdminInput
                    label="Annual Price (cents)"
                    type="number" min="0"
                    value={tier.priceAnnual}
                    onChange={(v) => patchTierField(tier.id, 'priceAnnual', v)}
                    hint={formatCents(tier.priceAnnual) + '/yr'}
                  />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => reset('subscriptionTiers')}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline">
            Reset subscription tiers to defaults
          </button>
        </div>
      )}

      {/* ── Revenue Splits ── */}
      {tab === 'splits' && (
        <div className="max-w-md space-y-5">
          <p className="text-sm text-[var(--text-muted)]">Creator and platform shares must add up to 100%.</p>
          <AdminInput
            label="Platform fee %"
            type="number" min="0" max="100"
            value={cfg.platformFeePct ?? 20}
            onChange={(v) => {
              const fee = Math.min(100, Math.max(0, Number(v)));
              patch('platformFeePct', fee);
              patch('creatorSharePct', 100 - fee);
            }}
            hint={`Creator receives ${100 - (cfg.platformFeePct ?? 20)}%`}
          />
          <AdminInput
            label="Coins per USD"
            type="number" min="1"
            value={cfg.coinsPerDollar ?? 100}
            onChange={(v) => patch('coinsPerDollar', Number(v))}
            hint="Exchange rate: how many coins equal $1.00"
          />
          <div className="grid grid-cols-2 gap-3">
            <AdminInput
              label="PPV Min (cents)"
              type="number" min="1"
              value={cfg.ppvMinCents ?? 99}
              onChange={(v) => patch('ppvMinCents', Number(v))}
              hint={formatCents(cfg.ppvMinCents ?? 99)}
            />
            <AdminInput
              label="PPV Max (cents)"
              type="number" min="1"
              value={cfg.ppvMaxCents ?? 9999}
              onChange={(v) => patch('ppvMaxCents', Number(v))}
              hint={formatCents(cfg.ppvMaxCents ?? 9999)}
            />
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
            <div className="font-semibold text-slate-800 mb-1">Revenue split preview</div>
            <div className="space-y-1">
              <div className="flex justify-between"><span>Platform fee</span><span className="font-medium">{cfg.platformFeePct ?? 20}%</span></div>
              <div className="flex justify-between"><span>Creator share</span><span className="font-medium text-emerald-600">{100 - (cfg.platformFeePct ?? 20)}%</span></div>
              <div className="flex justify-between text-xs text-slate-400 mt-2 pt-2 border-t border-slate-200"><span>On a 1,000-coin gift</span><span>Creator gets {(1000 * ((100 - (cfg.platformFeePct ?? 20)) / 100)).toFixed(0)} coins</span></div>
            </div>
          </div>
          <button type="button" onClick={() => { reset('platformFeePct'); reset('creatorSharePct'); reset('coinsPerDollar'); reset('ppvMinCents'); reset('ppvMaxCents'); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">
            Reset to defaults
          </button>
        </div>
      )}

      {/* ── Regional Pricing ── */}
      {tab === 'regions' && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-1">
            Set the price multiplier for each market tier. Tier A = full price (1.0), lower tiers get discounts.
            Multipliers apply to all coin packs and subscription prices shown to users in those countries.
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Changes are applied live. The frontend caches region data for 24 hours per visitor.
          </p>

          {/* Tier multipliers */}
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Market Tier Multipliers</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {regionData && Object.entries(regionData.tiers ?? {}).map(([id, tier]) => {
              const COLORS = { A: 'border-blue-400 bg-blue-50', B: 'border-teal-400 bg-teal-50', C: 'border-amber-400 bg-amber-50', D: 'border-rose-400 bg-rose-50' };
              const DISC   = { A: 'text-[var(--text-muted)]', B: 'text-teal-600', C: 'text-amber-600', D: 'text-rose-600' };
              const discount = Math.round((1 - (tier.multiplier ?? 1)) * 100);
              return (
                <div key={id} className={`border-2 rounded-xl p-4 ${COLORS[id] ?? 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800">Tier {id}</span>
                    <span className={`text-xs font-semibold ${DISC[id]}`}>
                      {discount > 0 ? `${discount}% off` : 'Full price'}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mb-3">{tier.label} — {tier.description}</div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Multiplier (0–1)</label>
                  <input
                    type="number" min="0.01" max="1" step="0.01"
                    value={tier.multiplier ?? 1}
                    onChange={(e) => patchTierMultiplier(id, e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <div className="text-xs text-slate-400 mt-1">
                    e.g. $9.99 × {tier.multiplier ?? 1} = ${((9.99) * (tier.multiplier ?? 1)).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Country coverage summary */}
          {regionData?.countryMap && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Country Coverage</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['A','B','C','D'].map((tierId) => {
                  const countries = Object.entries(regionData.countryMap)
                    .filter(([, v]) => v.tier === tierId)
                    .map(([cc]) => cc);
                  const LABELS = { A: 'Premium', B: 'Standard', C: 'Emerging', D: 'Growth' };
                  const BG = { A: 'bg-blue-50 border-blue-200', B: 'bg-teal-50 border-teal-200', C: 'bg-amber-50 border-amber-200', D: 'bg-rose-50 border-rose-200' };
                  return (
                    <div key={tierId} className={`rounded-xl border p-3 ${BG[tierId]}`}>
                      <div className="font-semibold text-slate-700 text-sm mb-1">Tier {tierId} — {LABELS[tierId]}</div>
                      <div className="text-xs text-[var(--text-muted)] mb-2">{countries.length} countries</div>
                      <div className="flex flex-wrap gap-1">
                        {countries.slice(0, 12).map((cc) => (
                          <span key={cc} className="text-[10px] font-mono bg-white/70 border border-slate-200 rounded px-1">{cc}</span>
                        ))}
                        {countries.length > 12 && <span className="text-[10px] text-slate-400">+{countries.length - 12} more</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FX rates */}
          {regionData?.fx && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">FX Rates (1 USD = X local currency)</h3>
              <p className="text-xs text-slate-400 mb-3">Used to convert USD prices into local currency amounts. Update when rates drift significantly.</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-80 overflow-y-auto pr-1">
                {Object.entries(regionData.fx).map(([currency, rate]) => (
                  <div key={currency} className="bg-white border border-slate-200 rounded-lg p-2">
                    <div className="text-xs font-bold text-slate-700 mb-1">{currency}</div>
                    <input
                      type="number" min="0.001" step="0.001"
                      value={rate}
                      onChange={(e) => patchFx(currency, e.target.value)}
                      className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs"
                    />
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Default: {regionData.defaultFx?.[currency] ?? rate}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button"
                onClick={() => { setRegionData((r) => ({ ...r, fx: r.defaultFx })); setRegionDirty((d) => ({ ...d, fx: regionData.defaultFx })); }}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline">
                Reset all FX rates to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Payouts View
───────────────────────────────────────── */
const PAYOUT_STATUS_COLORS = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

function PayoutsView() {
  const { t } = useTranslation();
  const [payouts,   setPayouts]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('pending');
  const [total,     setTotal]     = useState(0);
  const [busy,      setBusy]      = useState({});
  const [noteModal, setNoteModal] = useState(null); // { payoutId, action }
  const [note,      setNote]      = useState('');
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.adminGetPayouts(filter, 1, 50);
      setPayouts(d.payouts || []);
      setTotal(d.total || 0);
    } catch (e) { setFlash(e.message, 'err'); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openNote = (payoutId, action) => { setNoteModal({ payoutId, action }); setNote(''); };

  const submitAction = async () => {
    if (!noteModal) return;
    const { payoutId, action } = noteModal;
    setBusy((b) => ({ ...b, [payoutId]: true }));
    setNoteModal(null);
    try {
      await api.adminPayoutAction(payoutId, action, note);
      setPayouts((ps) => ps.filter((p) => String(p._id) !== payoutId));
      setFlash(`Payout ${action}d successfully.`, 'ok');
    } catch (e) { setFlash(e.message, 'err'); }
    setBusy((b) => ({ ...b, [payoutId]: false }));
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Payout Requests</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{total} total</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${flash.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {flash.msg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payouts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">{t('admin.noFilterPayouts', { filter })}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Creator', 'Amount', 'Method', 'Destination', 'Requested', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.map((p) => (
                <tr key={String(p._id)} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{String(p.userId).slice(-8)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">${(p.amountCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{p.provider || 'stripe'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] max-w-[140px] truncate">{p.destination || '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded border text-xs font-semibold capitalize ${PAYOUT_STATUS_COLORS[p.status] || PAYOUT_STATUS_COLORS.pending}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button type="button" disabled={!!busy[String(p._id)]}
                          onClick={() => openNote(String(p._id), 'approve')}
                          className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
                          Approve
                        </button>
                        <button type="button" disabled={!!busy[String(p._id)]}
                          onClick={() => openNote(String(p._id), 'reject')}
                          className="px-3 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 disabled:opacity-40 transition-colors">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">{p.reviewNote || '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Note / confirmation modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 capitalize">{noteModal.action} Payout</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {noteModal.action === 'approve'
                ? 'Add an optional note for the creator (e.g. expected transfer date).'
                : 'Provide a reason for rejection — this will be sent to the creator.'}
            </p>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={noteModal.action === 'approve' ? 'Optional note…' : 'Rejection reason…'}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setNoteModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={submitAction}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors ${noteModal.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                Confirm {noteModal.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Sidebar
───────────────────────────────────────── */
const SIDEBAR_ITEMS = [
  {
    view: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    view: 'users',
    label: 'Users',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    view: 'supportManagement',
    label: 'Support Management',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    view: 'notifications',
    label: 'Notifications',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    view: 'branding',
    label: 'Branding',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    view: 'translations',
    label: 'Translations',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    ),
  },
  {
    view: 'observability',
    label: 'System Health',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    view: 'platform',
    label: 'Platform',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    view: 'pricing',
    label: 'Pricing',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    view: 'moderation',
    label: 'Moderation',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    view: 'creators',
    label: 'Creators',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      </svg>
    ),
  },
  {
    view: 'payouts',
    label: 'Payouts',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    view: 'fraud',
    label: 'Fraud',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    view: 'dmca',
    label: 'DMCA',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    view: 'config',
    label: 'Configuration',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    view: 'account',
    label: 'Account',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

const VIEW_LABELS = {
  dashboard:     'Dashboard',
  users:         'Users',
  notifications: 'Notifications',
  branding:      'Branding',
  translations:  'Translations',
  observability: 'System Health',
  platform:      'Platform Tools',
  pricing:       'Pricing',
  moderation:    'Moderation Queue',
  creators:      'Creator Applications',
  payouts:       'Payout Requests',
  fraud:         'Fraud Alerts',
  dmca:          'DMCA Notices',
  config:        'System Configuration',
  account:       'Account',
  supportManagement: 'Support Management',
};

/* ─────────────────────────────────────────
   Support Management View (admin): create support account, list agents, disable/enable, audit logs, assign permissions
───────────────────────────────────────── */
function SupportManagementView({ staffUser }) {
  const [agents, setAgents] = useState([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [msg, showMsg] = useFlash();
  const [actingId, setActingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    displayName: '',
    canModerate: true,
    canViewTickets: true,
    canRespondTickets: true,
  });

  const loadAgents = useCallback(() => {
    setLoading(true);
    api.adminListSupportAgents(staffUser, 1, 50)
      .then((data) => {
        setAgents(data.users || []);
        setAgentsTotal(data.total ?? 0);
      })
      .catch((e) => showMsg('err', e.message || 'Failed to load agents'))
      .finally(() => setLoading(false));
  }, [staffUser, showMsg]);

  const loadAuditLogs = useCallback((offset = 0) => {
    setAuditLoading(true);
    api.adminGetAuditLogs(staffUser, { limit: 50, offset })
      .then((data) => {
        setAuditLogs(data.logs || []);
        setAuditTotal(data.total ?? 0);
      })
      .catch((e) => showMsg('err', e.message || 'Failed to load audit logs'))
      .finally(() => setAuditLoading(false));
  }, [staffUser, showMsg]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadAuditLogs(0); }, [loadAuditLogs]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.email || !createForm.password) {
      showMsg('err', 'Email and password are required.');
      return;
    }
    if (createForm.password.length < 8) {
      showMsg('err', 'Password must be at least 8 characters.');
      return;
    }
    setActingId('create');
    try {
      await api.adminCreateSupportAccount(staffUser, createForm);
      showMsg('ok', 'Support account created.');
      setCreateForm({ email: '', password: '', displayName: '', canModerate: true, canViewTickets: true, canRespondTickets: true });
      setShowCreate(false);
      loadAgents();
      loadAuditLogs(0);
    } catch (err) {
      showMsg('err', err.message || 'Create failed');
    } finally {
      setActingId(null);
    }
  };

  const handleSuspend = async (userId) => {
    setActingId(userId);
    try {
      await api.adminSuspendUser(staffUser, userId);
      showMsg('ok', 'Agent disabled.');
      loadAgents();
    } catch (err) {
      showMsg('err', err.message || 'Failed to suspend');
    } finally {
      setActingId(null);
    }
  };

  const handleUnsuspend = async (userId) => {
    setActingId(userId);
    try {
      await api.adminUnsuspendUser(staffUser, userId);
      showMsg('ok', 'Agent enabled.');
      loadAgents();
    } catch (err) {
      showMsg('err', err.message || 'Failed to unsuspend');
    } finally {
      setActingId(null);
    }
  };

  const handleSavePermissions = async (userId, permissions) => {
    setActingId(userId);
    try {
      await api.adminPatchUser(staffUser, userId, { permissions });
      showMsg('ok', 'Permissions updated.');
      setEditAgent(null);
      loadAgents();
    } catch (err) {
      showMsg('err', err.message || 'Failed to update permissions');
    } finally {
      setActingId(null);
    }
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div className="space-y-8">
      <Flash msg={msg} />

      {/* Create support account */}
      <div className="admin-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Create support account</h2>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {showCreate ? 'Hide' : 'Add agent'}
          </button>
        </div>
        {showCreate && (
          <form onSubmit={handleCreate} className="space-y-4 max-w-md">
            <AdminInput label="Email" type="email" required value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="support@milloapp.com" />
            <AdminInput label="Password" type="password" required minLength={8} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
            <AdminInput label="Display name (optional)" value={createForm.displayName} onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="Support Agent" />
            <div className="flex flex-wrap gap-6">
              <AdminToggle label="View tickets" checked={createForm.canViewTickets} onChange={(v) => setCreateForm((f) => ({ ...f, canViewTickets: v }))} />
              <AdminToggle label="Respond to tickets" checked={createForm.canRespondTickets} onChange={(v) => setCreateForm((f) => ({ ...f, canRespondTickets: v }))} />
              <AdminToggle label="Moderate" checked={createForm.canModerate} onChange={(v) => setCreateForm((f) => ({ ...f, canModerate: v }))} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!!actingId} className="px-4 py-2 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                {actingId === 'create' ? 'Creating…' : 'Create account'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* List support agents */}
      <div className="admin-card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Support agents ({agentsTotal})</h2>
        {loading && agents.length === 0 ? (
          <div className="py-8 flex justify-center"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : agents.length === 0 ? (
          <p className="text-slate-500 py-4">No support agents yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((u) => {
                  const id = u._id || u.id;
                  const isSuspended = u.status === 'suspended' || u.flags?.suspended;
                  const isEditing = editAgent && (editAgent._id === id || editAgent.id === id);
                  const perms = u.permissions || {};
                  return (
                    <tr key={id}>
                      <td>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{u.displayName || u.email?.split('@')[0] || '—'}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${isSuspended ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSuspended ? 'bg-red-500' : 'bg-green-500'}`} />
                          {isSuspended ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAgent.perms.canViewTickets} onChange={(e) => setEditAgent((a) => ({ ...a, perms: { ...a.perms, canViewTickets: e.target.checked } }))} /> View tickets</label>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAgent.perms.canRespondTickets} onChange={(e) => setEditAgent((a) => ({ ...a, perms: { ...a.perms, canRespondTickets: e.target.checked } }))} /> Respond</label>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAgent.perms.canModerate} onChange={(e) => setEditAgent((a) => ({ ...a, perms: { ...a.perms, canModerate: e.target.checked } }))} /> Moderate</label>
                            <button type="button" onClick={() => handleSavePermissions(id, editAgent.perms)} disabled={!!actingId} className="text-xs font-medium text-blue-600 hover:text-blue-700">Save</button>
                            <button type="button" onClick={() => setEditAgent(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {[perms.canViewTickets && 'View', perms.canRespondTickets && 'Respond', perms.canModerate && 'Moderate'].filter(Boolean).join(', ') || '—'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? null : (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setEditAgent({ _id: id, id, perms: { ...perms } })} className="text-xs font-medium text-blue-600 hover:text-blue-700">Permissions</button>
                            {isSuspended ? (
                              <button type="button" onClick={() => handleUnsuspend(id)} disabled={!!actingId} className="text-xs font-medium text-green-600 hover:text-green-700">Enable</button>
                            ) : (
                              <button type="button" onClick={() => handleSuspend(id)} disabled={!!actingId} className="text-xs font-medium text-red-600 hover:text-red-700">Disable</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit logs */}
      <div className="admin-card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Audit logs</h2>
        {auditLoading && auditLogs.length === 0 ? (
          <div className="py-8 flex justify-center"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : auditLogs.length === 0 ? (
          <p className="text-slate-500 py-4">No audit entries.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log._id}>
                    <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="text-xs">{log.adminId?.email || log.adminId || '—'}</td>
                    <td className="text-xs font-medium">{log.action}</td>
                    <td className="text-xs">{log.targetType ? `${log.targetType}: ${log.targetId || '—'}` : '—'}</td>
                    <td className="text-xs text-slate-500 max-w-xs truncate" title={JSON.stringify(log.meta)}>{log.meta && Object.keys(log.meta).length ? JSON.stringify(log.meta) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   DMCA Notices View (admin)
───────────────────────────────────────── */
function DmcaView({ staffUser }) {
  const { t } = useTranslation();
  const [notices, setNotices] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, showMsg] = useFlash();
  const [actingId, setActingId] = useState(null);
  const [repeatInfringerNotice, setRepeatInfringerNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    legalApi.listDmcaNotices(staffUser, { status: statusFilter || undefined, limit: 50, offset: 0 })
      .then((data) => {
        setNotices(data.notices || []);
        setTotal(data.total ?? 0);
      })
      .catch((e) => showMsg('err', e.message))
      .finally(() => setLoading(false));
  }, [staffUser, statusFilter, showMsg]);

  useEffect(() => { load(); }, [load]);

  const doAccept = async (notice) => {
    setActingId(notice._id);
    try {
      const result = await legalApi.acceptDmcaNotice(staffUser, notice._id);
      showMsg('ok', 'Notice accepted; content taken down.');
      if (result.repeatInfringer && result.notice?.contentOwnerId) {
        setRepeatInfringerNotice({ noticeId: notice._id, contentOwnerId: result.notice.contentOwnerId });
      }
      load();
    } catch (e) {
      showMsg('err', e.message);
    } finally {
      setActingId(null);
    }
  };

  const doReject = async (notice, reason) => {
    setActingId(notice._id);
    try {
      await legalApi.rejectDmcaNotice(staffUser, notice._id, reason || '');
      showMsg('ok', 'Notice rejected.');
      load();
    } catch (e) {
      showMsg('err', e.message);
    } finally {
      setActingId(null);
    }
  };

  const doRestore = async (notice) => {
    setActingId(notice._id);
    try {
      await legalApi.restoreDmcaNotice(staffUser, notice._id);
      showMsg('ok', 'Content restored.');
      load();
    } catch (e) {
      showMsg('err', e.message);
    } finally {
      setActingId(null);
    }
  };

  const doLawsuitFiled = async (notice) => {
    setActingId(notice._id);
    try {
      await legalApi.lawsuitFiledDmcaNotice(staffUser, notice._id);
      showMsg('ok', 'Marked as lawsuit filed; content will not be restored.');
      load();
    } catch (e) {
      showMsg('err', e.message);
    } finally {
      setActingId(null);
    }
  };

  const handleSuspendRepeatInfringer = async () => {
    if (!repeatInfringerNotice?.contentOwnerId) return;
    setActingId(repeatInfringerNotice.contentOwnerId);
    try {
      await api.adminSuspendUser(staffUser, repeatInfringerNotice.contentOwnerId, 'Repeat DMCA infringer');
      showMsg('ok', 'User suspended per repeat-infringer policy.');
      setRepeatInfringerNotice(null);
    } catch (e) {
      showMsg('err', e.message);
    } finally {
      setActingId(null);
    }
  };

  const statusOpts = [
    { value: '', label: t('admin.dmca.allStatus', 'All') },
    { value: 'pending', label: t('admin.dmca.pending', 'Pending') },
    { value: 'taken_down', label: t('admin.dmca.takenDown', 'Taken down') },
    { value: 'rejected', label: t('admin.dmca.rejected', 'Rejected') },
  ];

  if (loading && notices.length === 0) {
    return <div className="text-slate-500 text-sm p-4">{t('admin.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <Flash msg={msg} />
      {repeatInfringerNotice && (
        <div className="admin-card border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">{t('admin.dmca.repeatInfringer', 'Repeat infringer — consider suspending this user.')}</p>
          <p className="text-xs text-amber-700 mt-1">User ID: {repeatInfringerNotice.contentOwnerId}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleSuspendRepeatInfringer} disabled={!!actingId}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
              {t('admin.dmca.suspendUser', 'Suspend user')}
            </button>
            <button type="button" onClick={() => setRepeatInfringerNotice(null)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50">
              {t('admin.dmca.dismiss', 'Dismiss')}
            </button>
          </div>
        </div>
      )}
      <div className="admin-card flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{t('admin.dmca.notices', 'DMCA Notices')}</h3>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white">
          {statusOpts.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {notices.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">{t('admin.dmca.noNotices', 'No notices match the filter.')}</p>
        )}
        {notices.map((notice) => (
          <div key={notice._id} className="admin-card border border-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono text-slate-400">{notice._id}</p>
                <p className="text-sm font-medium text-slate-800 mt-1">{notice.claimantName} &lt;{notice.claimantEmail}&gt;</p>
                <p className="text-xs text-slate-600 mt-0.5">{notice.workDescription?.slice(0, 120)}{notice.workDescription?.length > 120 ? '…' : ''}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {notice.targetType} · {String(notice.targetId)} · {notice.status}
                  {notice.contentOwnerId && ` · Owner: ${notice.contentOwnerId}`}
                </p>
                {notice.counterNotice?.submittedAt && (
                  <p className="text-xs text-slate-500 mt-0.5">Counter-notice: {new Date(notice.counterNotice.submittedAt).toLocaleString()} · restore after: {notice.counterNotice.restoreAfter ? new Date(notice.counterNotice.restoreAfter).toLocaleDateString() : '—'}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {notice.status === 'pending' && (
                  <>
                    <button type="button" onClick={() => doAccept(notice)} disabled={!!actingId}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {t('admin.dmca.accept', 'Accept & take down')}
                    </button>
                    <button type="button" onClick={() => doReject(notice)} disabled={!!actingId}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                      {t('admin.dmca.reject', 'Reject')}
                    </button>
                  </>
                )}
                {notice.status === 'taken_down' && notice.counterNotice?.restoreAfter && !notice.counterNotice?.lawsuitFiled && (
                  <>
                    <button type="button" onClick={() => doRestore(notice)} disabled={!!actingId}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                      {t('admin.dmca.restore', 'Restore')}
                    </button>
                    <button type="button" onClick={() => doLawsuitFiled(notice)} disabled={!!actingId}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {t('admin.dmca.lawsuitFiled', 'Lawsuit filed')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        <Link to="/legal/dmca" className="text-blue-600 hover:underline">{t('admin.dmca.publicForm', 'Public DMCA form')}</Link>
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────
   Account view — change password (e.g. temporary install credentials)
───────────────────────────────────────── */
function AccountView() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, showMsg] = useFlash();
  const token = getToken();
  const user = getUser();

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showMsg('err', t('admin.account.passwordMismatch', 'New password and confirmation do not match.'));
      return;
    }
    if (newPassword.length < 8) {
      showMsg('err', t('admin.account.passwordTooShort', 'New password must be at least 8 characters.'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
      showMsg('ok', t('admin.account.passwordChanged', 'Password updated. Use your new password next time you sign in.'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showMsg('err', err.message || t('admin.account.changeFailed', 'Failed to change password.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="admin-card border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">{t('admin.account.loginRequired', 'Sign in with your admin account to change your password.')}</p>
          <p className="text-xs text-amber-700 mt-1">{t('admin.account.loginHint', 'Use the temporary credentials from installation, then change them here.')}</p>
          <Link to="/login" className="mt-3 inline-block px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
            {t('admin.account.goToLogin', 'Go to sign in')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Flash msg={msg} />
      <div className="admin-card">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">{t('admin.account.changePassword', 'Change password')}</h3>
        <p className="text-xs text-slate-500 mb-4">{t('admin.account.changePasswordDesc', 'Update your sign-in password. Recommended after first install when using temporary credentials.')}</p>
        {user?.email && <p className="text-xs text-slate-600 mb-3">Account: <strong>{user.email}</strong></p>}
        <p className="text-xs text-slate-500 mb-3">{t('admin.account.generateHint', 'We recommend using a generated secure password and saving it in a password manager.')}</p>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <AdminInput type="password" label={t('admin.account.currentPassword', 'Current password')} placeholder="••••••••" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <div>
            <div className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <AdminInput type="password" label={t('admin.account.newPassword', 'New password')} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
              </div>
              <button type="button" onClick={() => { const p = generateSecurePassword(16); setNewPassword(p); setConfirmPassword(p); }} disabled={loading}
                className="shrink-0 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium whitespace-nowrap">
                {t('admin.account.generatePassword', 'Generate secure')}
              </button>
            </div>
          </div>
          <AdminInput type="password" label={t('admin.account.confirmPassword', 'Confirm new password')} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          <button type="submit" disabled={loading} className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? t('admin.account.updating', 'Updating…') : t('admin.account.updatePassword', 'Update password')}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Observability / System Health View
───────────────────────────────────────── */
function ObservabilityView({ staffUser }) {
  const [tab, setTab] = useState('health');
  const [health, setHealth] = useState(null);
  const [rootHealth, setRootHealth] = useState(null);
  const [security, setSecurity] = useState(null);
  const [drift, setDrift] = useState(null);
  const [upgrade, setUpgrade] = useState(null);
  const [queues, setQueues] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (which) => {
    setLoading(true);
    setError(null);
    try {
      if (which === 'health') {
        const [obs, root] = await Promise.all([
          api.adminGetObservationHealth(staffUser),
          api.adminGetRootHealth().catch(() => null),
        ]);
        setHealth(obs);
        setRootHealth(root);
      } else if (which === 'security') setSecurity(await api.adminGetObservationSecurity(staffUser));
      else if (which === 'drift') setDrift(await api.adminGetObservationDrift(staffUser));
      else if (which === 'upgrade') setUpgrade(await api.adminGetObservationUpgrade(staffUser));
      else if (which === 'queues') setQueues(await api.adminGetObservationQueues(staffUser));
    } catch (e) {
      setError(e.message || 'Failed to load');
    }
    setLoading(false);
  }, [staffUser]);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const apiBase = API_BASE;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h2 className="text-xl font-bold text-slate-800">System Health & Observability</h2>
      <p className="text-sm text-[var(--text-muted)]">Read-only system status. No auto-changes.</p>

      <div className="flex gap-2 flex-wrap">
        {['health', 'security', 'drift', 'upgrade', 'queues'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>}
      {loading && <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && tab === 'health' && (health || rootHealth) && (
        <div className="admin-card space-y-4">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${(rootHealth?.ok ?? health?.status === 'healthy') ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="font-semibold text-slate-700">Status: {rootHealth?.status ?? health?.status ?? 'unknown'}</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {rootHealth?.uptime != null && <><dt className="text-[var(--text-muted)]">Uptime (s)</dt><dd>{Math.round(rootHealth.uptime)}</dd></>}
            {health?.node && <><dt className="text-[var(--text-muted)]">Node</dt><dd className="font-mono">{health.node}</dd></>}
            {health?.uptimeSeconds != null && <><dt className="text-[var(--text-muted)]">Uptime (s)</dt><dd>{health.uptimeSeconds}</dd></>}
          </dl>
          {rootHealth?.checks && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Service checks</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(rootHealth.checks).map(([k, v]) => (
                  <span key={k} className={`px-2 py-1 rounded text-xs font-medium ${v === 'ok' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Prometheus metrics</p>
            <a href={`${apiBase}/metrics`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-mono">
              {apiBase}/metrics
            </a>
          </div>
        </div>
      )}

      {!loading && tab === 'security' && security && (
        <div className="admin-card">
          <h3 className="font-semibold text-slate-700 mb-3">Security Alerts</h3>
          {security.alerts?.length ? (
            <ul className="space-y-2">
              {security.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                  <span className="text-amber-600 font-medium">!</span>
                  <span>{typeof a === 'string' ? a : (a.message || a.title || JSON.stringify(a))}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[var(--text-muted)] text-sm">No security alerts.</p>}
        </div>
      )}

      {!loading && tab === 'drift' && drift && (
        <div className="admin-card">
          <h3 className="font-semibold text-slate-700 mb-3">Drift Detection</h3>
          {drift.recommendations?.length ? (
            <ul className="space-y-2">
              {drift.recommendations.map((r, i) => (
                <li key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                  {typeof r === 'string' ? r : (r.message || r.title || JSON.stringify(r))}
                </li>
              ))}
            </ul>
          ) : <p className="text-[var(--text-muted)] text-sm">No drift detected.</p>}
        </div>
      )}

      {!loading && tab === 'upgrade' && upgrade && (
        <div className="admin-card">
          <h3 className="font-semibold text-slate-700 mb-3">Upgrade Recommendations</h3>
          {upgrade.recommendations?.length ? (
            <ul className="space-y-2">
              {upgrade.recommendations.map((r, i) => (
                <li key={i} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                  {typeof r === 'string' ? r : (r.message || r.title || JSON.stringify(r))}
                </li>
              ))}
            </ul>
          ) : <p className="text-[var(--text-muted)] text-sm">No upgrade recommendations.</p>}
        </div>
      )}

      {!loading && tab === 'queues' && queues && (
        <div className="admin-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-700">Queue & Worker Stats</h3>
            <div className="flex flex-wrap gap-3 justify-end">
              <Link to="/admin/ops" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Ops overview →</Link>
              <Link to="/admin/metrics" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View Metrics Dashboard →</Link>
            </div>
          </div>
          {queues.message && <p className="text-amber-600 text-sm mb-2">{queues.message}</p>}
          {queues.queues?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-600">Queue</th>
                    <th className="text-right py-2 font-medium text-slate-600">Waiting</th>
                    <th className="text-right py-2 font-medium text-slate-600">Active</th>
                    <th className="text-right py-2 font-medium text-slate-600">Completed</th>
                    <th className="text-right py-2 font-medium text-slate-600">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {queues.queues.map((q) => (
                    <tr key={q.name} className="border-b border-slate-100">
                      <td className="py-2 font-mono">{q.name}</td>
                      <td className="text-right py-2">{q.waiting ?? '-'}</td>
                      <td className="text-right py-2">{q.active ?? '-'}</td>
                      <td className="text-right py-2">{q.completed ?? '-'}</td>
                      <td className="text-right py-2">{q.failed ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !queues.message && <p className="text-[var(--text-muted)] text-sm">No queue data.</p>}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Moderation Queue View
───────────────────────────────────────── */
/* adminFetch replaced by api.adminGetReports / api.adminReportAction */

const REASON_LABELS = {
  spam: 'Spam', harassment: 'Harassment', nudity: 'Nudity/Sexual',
  violence: 'Violence', misinformation: 'Misinformation', hate_speech: 'Hate Speech', other: 'Other',
};
const REASON_COLORS = {
  harassment: 'text-red-600 bg-red-50 border-red-200',
  violence:   'text-red-600 bg-red-50 border-red-200',
  nudity:     'text-orange-600 bg-orange-50 border-orange-200',
  hate_speech:'text-orange-600 bg-orange-50 border-orange-200',
  spam:       'text-slate-600 bg-slate-50 border-slate-200',
  default:    'text-slate-600 bg-slate-50 border-slate-200',
};

function ModerationView() {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('open');
  const [total,    setTotal]    = useState(0);
  const [busy,     setBusy]     = useState({});
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.adminGetReports(filter, 50);
      setReports(d.reports || []);
      setTotal(d.total || 0);
    } catch (e) { setFlash(e.message, 'err'); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const action = async (id, act) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.adminReportAction(id, act);
      setReports((rs) => rs.filter((r) => String(r._id) !== id));
      setFlash(`Report ${act}d.`, 'ok');
    } catch (e) { setFlash(e.message, 'err'); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  return (
    <div>
      <Flash msg={flash} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Moderation Queue</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{total} report{total !== 1 ? 's' : ''} · showing {filter}</p>
        </div>
        <div className="flex gap-2">
          {['open', 'reviewing', 'resolved', 'dismissed', 'all'].map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${filter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          AI moderation <TrustBadge feature="moderation" />
        </span>
        <span className="flex items-center gap-1.5">
          Fraud <TrustBadge feature="fraudProtection" />
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[var(--text-muted)] text-sm">Queue is clear!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const rc = REASON_COLORS[r.reason] || REASON_COLORS.default;
            return (
              <div key={String(r._id)} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2 py-0.5 rounded border text-xs font-medium ${rc}`}>
                        {REASON_LABELS[r.reason] || r.reason}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-xs">
                        {r.targetType}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">ID: {r.targetId}</span>
                    </div>
                    {r.description && (
                      <p className="text-sm text-slate-600 mb-1 line-clamp-2">"{r.description}"</p>
                    )}
                    <p className="text-xs text-slate-400">
                      Reported by <span className="font-medium text-slate-600">{r.reporter?.displayName || 'User'}</span>
                      {' · '}{new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === 'open' && (
                      <button type="button" onClick={() => action(String(r._id), 'reviewing')} disabled={busy[r._id]}
                        className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50">
                        Review
                      </button>
                    )}
                    <button type="button" onClick={() => action(String(r._id), 'resolve')} disabled={busy[r._id]}
                      className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-50">
                      Resolve
                    </button>
                    <button type="button" onClick={() => action(String(r._id), 'dismiss')} disabled={busy[r._id]}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 text-xs font-medium hover:bg-slate-100 transition-colors disabled:opacity-50">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Creator Applications View
───────────────────────────────────────── */
function CreatorApplicationsView() {
  const { t } = useTranslation();
  const [apps,    setApps]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('pending');
  const [total,   setTotal]   = useState(0);
  const [busy,    setBusy]    = useState({});
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminFetch(`/creators/applications?status=${filter}&limit=50`);
      setApps(d.applications || []);
      setTotal(d.total || 0);
    } catch (e) { setFlash(e.message, 'err'); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (id, act, note = '') => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await adminFetch(`/creators/applications/${id}/${act}`, { method: 'POST', body: JSON.stringify({ note }) });
      setApps((prev) => prev.filter((a) => String(a._id) !== id));
      setFlash(`Application ${act}d.`, 'ok');
    } catch (e) { setFlash(e.message, 'err'); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  const STATUS_COLORS = {
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div>
      <Flash msg={flash} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Creator Applications</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{total} application{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${filter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : apps.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] text-sm">{t('admin.noApplications', { filter })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div key={String(app._id)} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-sm shrink-0">
                      {(app.displayName || app.profile?.displayName || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{app.displayName || app.profile?.displayName || 'Applicant'}</p>
                      <p className="text-xs text-slate-400">{app.category} · Applied {new Date(app.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`ml-auto px-2 py-0.5 rounded border text-xs font-medium ${STATUS_COLORS[app.status] || ''}`}>
                      {app.status}
                    </span>
                  </div>
                  {app.bio && <p className="text-sm text-slate-600 line-clamp-2 mt-2">"{app.bio}"</p>}
                  {app.socialLinks && Object.entries(app.socialLinks).some(([, v]) => v) && (
                    <div className="flex gap-3 mt-2">
                      {Object.entries(app.socialLinks).map(([k, v]) => v && (
                        <a key={k} href={v} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline capitalize">{k}</a>
                      ))}
                    </div>
                  )}
                  {app.sampleContent?.[0] && (
                    <a href={app.sampleContent[0]} target="_blank" rel="noopener noreferrer"
                      className="inline-block mt-2 text-xs text-blue-600 hover:underline">Sample content →</a>
                  )}
                </div>
                {app.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => doAction(String(app._id), 'approve')} disabled={busy[app._id]}
                      className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-bold hover:bg-green-100 transition-colors disabled:opacity-50">
                      Approve
                    </button>
                    <button type="button" onClick={() => doAction(String(app._id), 'reject', 'Does not meet requirements.')} disabled={busy[app._id]}
                      className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminSidebar({ view, setView }) {
  return (
    <aside className="admin-sidebar">
      <Link to="/" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold text-sm" aria-label="Home">
        m
      </Link>
      <div className="mt-2 flex flex-col gap-1 w-full px-1.5">
        {SIDEBAR_ITEMS.map(({ view: v, label, icon }) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-label={label}
            title={label}
            className={`w-full flex items-center justify-center h-10 rounded-lg transition-colors ${view === v ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
            <SbIcon>{icon}</SbIcon>
          </button>
        ))}
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────
   Main layout
───────────────────────────────────────── */
function AdminContent() {
  const { staffUser } = useStaffAuth();
  const [view, setView] = useState('dashboard');

  return (
    <>
      <SEO title="Admin Dashboard" description="Millo admin — dashboard, platform tools." path="/admin" />
      <div className="admin-layout">
        <AdminSidebar view={view} setView={setView} />
        <div className="admin-main">
          <header className="admin-header">
            <h1>{VIEW_LABELS[view] || 'Admin Dashboard'}</h1>
            <div className="flex items-center gap-2">
              <button type="button" className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors" aria-label="Profile">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              <Link to="/" className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors" aria-label="Back to site">
                <IconBack className="w-5 h-5" />
              </Link>
            </div>
          </header>
          <div className="admin-content">
            <OperationalStubBanner variant="admin" className="mb-4" />
            {view === 'dashboard'     && <DashboardView staffUser={staffUser} />}
            {view === 'users'         && <UsersView staffUser={staffUser} />}
            {view === 'supportManagement' && <SupportManagementView staffUser={staffUser} />}
            {view === 'notifications' && <NotificationsView staffUser={staffUser} />}
            {view === 'branding'      && <BrandingView staffUser={staffUser} />}
            {view === 'translations'  && <TranslationsView />}
            {view === 'observability' && <ObservabilityView staffUser={staffUser} />}
            {view === 'platform'      && <PlatformToolsView staffUser={staffUser} />}
            {view === 'pricing'       && <PricingView staffUser={staffUser} />}
            {view === 'moderation'    && <ModerationView />}
            {view === 'creators'      && <CreatorApplicationsView />}
            {view === 'payouts'       && <PayoutsView />}
            {view === 'fraud'         && <FraudView staffUser={staffUser} />}
            {view === 'dmca'          && <DmcaView staffUser={staffUser} />}
            {view === 'config'        && <SystemConfigView />}
            {view === 'account'       && <AccountView />}
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminPage() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminContent />
    </ProtectedRoute>
  );
}
