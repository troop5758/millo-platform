'use strict';
/**
 * @composed-module
 * Not routed directly.
 * Used by:
 * - AdminPage (config tab / internal composition)
 *
 * Service settings: Email, AI, Payments, OAuth, Storage, etc.
 * https://milloapp.com
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config/api.js';
import TrustBadge from '../../components/TrustBadge';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('staffToken') || localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function SettingField({ setting, onUpdate, saving }) {
  const [value, setValue] = useState(setting.value ?? setting.default ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(setting.value ?? setting.default ?? '');
    setDirty(false);
  }, [setting.value, setting.default]);

  const handleChange = (e) => {
    const newVal = setting.type === 'boolean' ? e.target.checked : e.target.value;
    setValue(newVal);
    setDirty(true);
  };

  const handleSave = async () => {
    let finalValue = value;
    if (setting.type === 'number') finalValue = Number(value);
    if (setting.type === 'boolean') finalValue = Boolean(value);
    await onUpdate(setting.key, finalValue);
    setDirty(false);
  };

  const handleReset = async () => {
    await onUpdate(setting.key, null, true);
    setDirty(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 border-b border-slate-100 last:border-b-0">
      <div>
        <label className="block text-sm font-medium text-slate-700">{setting.label}</label>
        {setting.description && (
          <p className="text-xs text-slate-500 mt-0.5">{setting.description}</p>
        )}
        {setting.envVar && (
          <span className="text-xs text-slate-400 font-mono">env: {setting.envVar}</span>
        )}
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        {setting.type === 'select' ? (
          <select
            value={value}
            onChange={handleChange}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Select --</option>
            {setting.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : setting.type === 'boolean' ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={handleChange}
              className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600">{value ? 'Enabled' : 'Disabled'}</span>
          </label>
        ) : (
          <input
            type={setting.sensitive ? 'password' : setting.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={handleChange}
            placeholder={setting.sensitive ? '••••••••' : ''}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        )}
        
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Save
            </button>
          )}
          {setting.hasValue && setting.source === 'database' && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
              title="Revert to environment variable or default"
            >
              Reset
            </button>
          )}
        </div>
        
        {setting.source && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            setting.source === 'database' ? 'bg-indigo-100 text-indigo-700' :
            setting.source === 'environment' ? 'bg-green-100 text-green-700' :
            'bg-slate-100 text-slate-500'
          }`}>
            {setting.source}
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryCard({ category, onUpdate, saving }) {
  const [expanded, setExpanded] = useState(false);
  const configuredCount = category.settings?.filter((s) => s.hasValue).length || 0;
  const totalCount = category.settings?.length || 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <CategoryIcon category={category.id} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-900">{category.label}</h3>
            <p className="text-sm text-slate-500">{category.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {configuredCount}/{totalCount} configured
          </span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {expanded && (
        <div className="px-6 pb-4 border-t border-slate-100">
          {category.settings?.map((setting) => (
            <SettingField
              key={setting.key}
              setting={setting}
              onUpdate={onUpdate}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryIcon({ category }) {
  const icons = {
    email: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    ai: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    payments: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    oauth: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    cloudflare: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
    storage: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
    streaming: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    database: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    eventbus: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    fraud: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    monitoring: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    platform: (
      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };
  return icons[category] || icons.platform;
}

function HealthSummary({ health }) {
  if (!health) return null;

  const services = Object.entries(health).map(([key, value]) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    ...value,
  }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
      <h3 className="font-bold text-slate-900 mb-4">Service Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {services.map((svc) => (
          <div key={svc.key} className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${svc.configured ? 'bg-green-500' : 'bg-slate-300'}`} />
            <div>
              <span className="text-sm font-medium text-slate-700">{svc.label}</span>
              {svc.provider && (
                <span className="text-xs text-slate-500 ml-1">({svc.provider})</span>
              )}
              {svc.providers?.length > 0 && (
                <span className="text-xs text-slate-500 ml-1">({svc.providers.join(', ')})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemConfigView() {
  const [categories, setCategories] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, healthRes] = await Promise.all([
        apiFetch('/admin/config'),
        apiFetch('/admin/config/health'),
      ]);
      setCategories(configRes.categories || []);
      setHealth(healthRes.health || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleUpdate = async (key, value, isDelete = false) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isDelete) {
        await apiFetch(`/admin/config/key/${encodeURIComponent(key)}`, { method: 'DELETE' });
        setSuccess(`Reset ${key} to default`);
      } else {
        await apiFetch(`/admin/config/key/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value }),
        });
        setSuccess(`Updated ${key}`);
      }
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleTest = async (categoryId) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(`/admin/config/${categoryId}/test`, { method: 'POST' });
      if (res.healthy) {
        setSuccess(`${categoryId} test passed`);
      } else {
        setError(`${categoryId} test failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await apiFetch('/admin/config/export');
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `millo-config-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">System Configuration</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage service integrations and API keys</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-xs text-slate-500">
            <span className="font-medium text-slate-600">Production truth</span>
            <span className="flex items-center gap-1">Pay <TrustBadge feature="payments" /></span>
            <span className="flex items-center gap-1">KYC <TrustBadge feature="kyc" /></span>
            <span className="flex items-center gap-1">Mod <TrustBadge feature="moderation" /></span>
            <span className="flex items-center gap-1">Fraud <TrustBadge feature="fraudProtection" /></span>
            <span className="flex items-center gap-1">Email <TrustBadge feature="email" /></span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadConfig}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <HealthSummary health={health} />

      <div className="space-y-4">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onUpdate={handleUpdate}
            saving={saving}
          />
        ))}
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-700 mb-2">Test Configurations</h3>
        <p className="text-sm text-slate-500 mb-4">
          Test your service configurations to verify they work correctly.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleTest('email')}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
          >
            Test Email
          </button>
          <button
            type="button"
            onClick={() => handleTest('payments')}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
          >
            Test Payments
          </button>
          <button
            type="button"
            onClick={() => handleTest('database')}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
          >
            Test Database
          </button>
        </div>
      </div>
    </div>
  );
}

export default SystemConfigView;
