/**
 * RegisterPage — create a new Millo account.
 * Recommends and can generate secure passwords.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { DisabledButton } from '../components/DisabledButton';
import { register, submitComplianceConsent } from '../sdk/authApi';
import { API_BASE } from '../config/api.js';
import { loadOauthProviderContract } from '../lib/oauthProviderLoad.js';
import { generateSecurePassword } from '../lib/passwordGenerator';
import { sendBehavior } from '../lib/behavior';

/** Must match policy versions you expose at /terms and /privacy. */
const SIGNUP_CONSENT_VERSION = '1.0';

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [form, setForm]     = useState({ email: '', password: '', displayName: '', username: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [oauth, setOauth] = useState({
    google: 'DISABLED',
    facebook: 'DISABLED',
    apple: 'DISABLED',
    twitter: 'DISABLED',
    github: 'DISABLED',
  });

  useEffect(() => {
    let cancelled = false;
    loadOauthProviderContract(API_BASE).then((contract) => {
      if (!cancelled) setOauth(contract);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error');
    if (!oauthError) return;
    const isNotConfigured = ['not_configured', 'not_implemented', 'not_supported', 'no_token', 'provider_disabled'].includes(oauthError);
    setError(isNotConfigured ? t('login.oauthNotConfigured') : t('login.oauthFailed'));
  }, [searchParams, t]);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) { setError(t('register.errorRequired')); return; }
    if (form.password.length < 8) { setError(t('register.errorPasswordLength')); return; }
    if (!consentAccepted) { setError(t('register.consentRequired', 'Please accept the Terms and Privacy Policy to continue.')); return; }
    setLoading(true);
    try {
      await register(form);
      try {
        await submitComplianceConsent({
          purpose: 'signup_terms_privacy',
          version: SIGNUP_CONSENT_VERSION,
          granted: true,
        });
      } catch {
        setError(t('register.consentLogFailed'));
        navigate('/settings/privacy', { replace: true });
        setLoading(false);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      sendBehavior().catch(() => {});
      setError(err.message || t('register.errorFailed'));
    }
    setLoading(false);
  };

  const handleGeneratePassword = () => {
    setForm((f) => ({ ...f, password: generateSecurePassword(16) }));
  };

  const FIELDS = [
    { id: 'displayName', label: t('register.displayName'), type: 'text',     placeholder: t('register.displayNamePlaceholder'), auto: 'name' },
    { id: 'username',    label: t('register.username'),     type: 'text',     placeholder: t('register.usernamePlaceholder'),    auto: 'username' },
    { id: 'email',       label: t('register.email'),        type: 'email',    placeholder: 'you@example.com',                    auto: 'email' },
    { id: 'password',    label: t('register.password'),     type: 'password', placeholder: t('register.passwordPlaceholder'),    auto: 'new-password' },
  ];

  return (
    <>
      <SEO title={t('register.title')} description={t('register.subtitle')} path="/signup" />
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[var(--text)]">{t('register.title')}</h1>
        <p className="mt-1 text-[var(--text-muted)]">{t('register.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-8 card space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              disabled={loading}
              className="mt-1 w-4 h-4 rounded border-[var(--border)]"
            />
            <span className="text-sm text-[var(--text-muted)]">
              {t('register.consentCheckbox', 'I agree to the')}{' '}
              <Link to="/terms" className="text-[var(--accent)] hover:underline">{t('register.terms')}</Link>
              {' '}{t('register.consentAnd', 'and')}{' '}
              <Link to="/privacy" className="text-[var(--accent)] hover:underline">{t('register.privacy')}</Link>
              .
            </span>
          </label>

          {FIELDS.map(({ id, label, type, placeholder, auto }) => (
            <div key={id}>
              <label htmlFor={`reg-${id}`} className="block text-sm font-medium text-[var(--text)] mb-1">{label}</label>
              <div className={id === 'password' ? 'flex gap-2' : ''}>
                <input
                  id={`reg-${id}`} type={type} autoComplete={auto}
                  placeholder={placeholder} value={form[id]}
                  onChange={update(id)} disabled={loading}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                />
                {id === 'password' && (
                  <button type="button" onClick={handleGeneratePassword} disabled={loading}
                    className="shrink-0 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] text-sm font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                    {t('register.generatePassword', 'Generate secure')}
                  </button>
                )}
              </div>
              {id === 'password' && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">{t('register.passwordHint', 'At least 8 characters. We recommend using a generated password and saving it in a password manager.')}</p>
              )}
            </div>
          ))}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? t('register.creating') : t('register.submit')}
          </button>
        </form>

        <div className="mt-5">
          <div className="relative flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)] shrink-0">{t('register.orContinue', 'or continue with')}</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {oauth.google === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/google`}
                className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-xs font-medium hover:bg-[var(--bg-card)]"
              >
                Google
              </a>
            ) : (
              <DisabledButton label={t('login.googleUnavailable')} />
            )}
            {oauth.facebook === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/facebook`}
                className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-xs font-medium hover:bg-[var(--bg-card)]"
              >
                Facebook
              </a>
            ) : (
              <DisabledButton label={t('login.facebookUnavailable')} />
            )}
            {oauth.apple === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/apple`}
                className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-xs font-medium hover:bg-[var(--bg-card)]"
              >
                Apple
              </a>
            ) : (
              <DisabledButton label={t('login.appleUnavailable')} />
            )}
          </div>
          {oauth.google !== 'LIVE' && oauth.facebook !== 'LIVE' && oauth.apple !== 'LIVE' && (
            <p className="mt-2 text-xs text-center text-[var(--text-muted)]">
              {t('register.socialUnavailable', 'Social sign-up is not configured on this deployment. Use email and password.')}
            </p>
          )}
        </div>

        <p className="mt-6 text-sm text-[var(--text-muted)] text-center">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="text-[var(--accent)] hover:underline font-medium">{t('register.signIn')}</Link>
        </p>
        <p className="mt-3 text-xs text-[var(--text-muted)] text-center">
          {t('register.legalReminder', 'Account creation also records consent version {{v}} for compliance.', { v: SIGNUP_CONSENT_VERSION })}
        </p>
      </div>
    </>
  );
}
