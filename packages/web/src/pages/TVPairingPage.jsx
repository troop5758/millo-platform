/**
 * TVPairingPage — connect Apple TV / Android TV to your account.
 * Generates pairing code; user enters it on TV app.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { tvCreatePairingCode, tvGetPairedDevices } from '../sdk/contentApi';

export function TVPairingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = getUser();

  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const loadDevices = () => {
    tvGetPairedDevices()
      .then((d) => setDevices(Array.isArray(d) ? d : []))
      .catch(() => setDevices([]));
  };

  useEffect(() => {
    if (user) loadDevices();
  }, [user]);

  const handleGenerateCode = async () => {
    setLoading(true);
    setError(null);
    setCode(null);
    try {
      const data = await tvCreatePairingCode();
      setCode(data.code);
      setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
    } catch (e) {
      setError(e.message || t('tvPairing.error', 'Failed to generate code'));
    }
    setLoading(false);
  };

  const expiresIn = expiresAt ? Math.max(0, Math.floor((expiresAt - new Date()) / 1000 / 60)) : 0;

  return (
    <>
      <SEO title={t('tvPairing.title', 'Connect TV')} description={t('tvPairing.desc', 'Pair your Apple TV or Android TV with Millo')} path="/tv-pairing" />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('tvPairing.title', 'Connect TV')}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t('tvPairing.subtitle', 'Pair your Apple TV or Android TV to watch Millo')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">{t('tvPairing.howItWorks', 'How it works')}</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-secondary)]">
            <li>{t('tvPairing.step1', 'Open the Millo app on your Apple TV or Android TV')}</li>
            <li>{t('tvPairing.step2', 'Select "Connect" or "Pair with account"')}</li>
            <li>{t('tvPairing.step3', 'Enter the code shown below')}</li>
          </ol>

          {!code ? (
            <button
              type="button"
              onClick={handleGenerateCode}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('tvPairing.generating', 'Generating…')}
                </>
              ) : (
                t('tvPairing.generateCode', 'Generate pairing code')
              )}
            </button>
          ) : (
            <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] p-6 text-center">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{t('tvPairing.enterOnTv', 'Enter this code on your TV')}</p>
              <p className="text-4xl font-mono font-bold text-[var(--text)] tracking-[0.3em]">{code}</p>
              {expiresIn > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-3">{t('tvPairing.expiresIn', 'Expires in {{min}} minutes', { min: expiresIn })}</p>
              )}
              <button
                type="button"
                onClick={handleGenerateCode}
                disabled={loading}
                className="mt-4 text-sm text-[var(--accent)] hover:underline"
              >
                {t('tvPairing.newCode', 'Generate new code')}
              </button>
            </div>
          )}
        </div>

        {devices.length > 0 && (
          <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-4">{t('tvPairing.pairedDevices', 'Paired devices')}</h2>
            <ul className="space-y-3">
              {devices.map((d, i) => (
                <li key={d.deviceId || i} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)] capitalize">{d.platform?.replace('_', ' ') || 'TV'}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {d.pairedAt && new Date(d.pairedAt).toLocaleDateString()}
                      {d.lastSeenAt && ` · Last seen ${new Date(d.lastSeenAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to="/profile" className="text-sm text-[var(--accent)] hover:underline">
            {t('common.backToProfile', 'Back to profile')}
          </Link>
        </div>
      </div>
    </>
  );
}
