/**
 * Login page — sign in for Millo. Wired from header "Login" button.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { DisabledButton } from '../components/DisabledButton';
import { login, verifyLoginOtp } from '../sdk/authApi';
import { sendBehavior, initBehaviorTracking } from '../lib/behavior';
import { API_BASE } from '../config/api.js';
import { loadOauthProviderContract } from '../lib/oauthProviderLoad.js';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauth, setOauth] = useState({
    google: 'DISABLED',
    facebook: 'DISABLED',
    apple: 'DISABLED',
    twitter: 'DISABLED',
    github: 'DISABLED',
  });
  const [otpId, setOtpId] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [captchaSiteKey, setCaptchaSiteKey] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef(null);

  useEffect(() => {
    initBehaviorTracking();
  }, []);

  useEffect(() => {
    if (!captchaSiteKey || !turnstileRef.current) return;
    let cancelled = false;
    const mountWidget = () => {
      if (cancelled || !turnstileRef.current || typeof window === 'undefined' || !window.turnstile) return;
      turnstileRef.current.innerHTML = '';
      window.turnstile.render(turnstileRef.current, {
        sitekey: captchaSiteKey,
        callback: (token) => setCaptchaToken(token),
      });
    };
    if (typeof window !== 'undefined' && window.turnstile) {
      mountWidget();
      return () => {
        cancelled = true;
      };
    }
    const existing = typeof document !== 'undefined' ? document.querySelector('script[data-millio-turnstile]') : null;
    if (existing) {
      const onLoad = () => mountWidget();
      existing.addEventListener('load', onLoad);
      return () => {
        cancelled = true;
        existing.removeEventListener('load', onLoad);
      };
    }
    if (typeof document === 'undefined') return () => { cancelled = true; };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.dataset.millioTurnstile = '1';
    s.onload = () => {
      if (!cancelled) mountWidget();
    };
    document.body.appendChild(s);
    return () => {
      cancelled = true;
    };
  }, [captchaSiteKey]);

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
    const isNotConfigured = ['not_configured', 'not_implemented', 'not_supported', 'no_token'].includes(oauthError);
    setError(isNotConfigured ? t('login.oauthNotConfigured') : t('login.oauthFailed'));
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(t('login.errorRequired'));
      return;
    }
    setLoading(true);
    try {
      const data = await login({
        email: email.trim(),
        password,
        ...(captchaToken ? { captchaToken } : {}),
      });
      if (data.stepUp && data.otpId) {
        setOtpId(data.otpId);
        setCaptchaSiteKey('');
        setCaptchaToken('');
        setLoading(false);
        return;
      }
      if (data.requireCaptcha) {
        setCaptchaSiteKey(data.siteKey || '');
        setError(
          t('login.captchaRequired', 'Complete the security check below, then sign in again.')
        );
        setLoading(false);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      sendBehavior().catch(() => {});
      setError(err.message || t('login.errorUnavailable'));
    }
    setLoading(false);
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!otpId || !otpCode.trim()) {
      setError(t('login.errorRequired'));
      return;
    }
    setLoading(true);
    try {
      await verifyLoginOtp({ otpId, code: otpCode.trim() });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('login.errorUnavailable'));
    }
    setLoading(false);
  };

  return (
    <>
      <SEO
        title="Sign in"
        description="Sign in to your Millo account."
        path="/login"
      />
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-[var(--text)]">{t('login.title')}</h1>
        <p className="mt-1 text-[var(--text-muted)]">{t('login.subtitle')}</p>

        {otpId ? (
          <form onSubmit={handleOtpSubmit} className="mt-8 card space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-[var(--accent-error)]/10 text-[var(--accent-error)] text-sm">
                {error}
              </div>
            )}
            <p className="text-sm text-[var(--text-muted)]">
              {t('login.otpHint', 'Enter the verification code we sent to your email.')}
            </p>
            <div>
              <label htmlFor="login-otp" className="block text-sm font-medium text-[var(--text)] mb-1">
                {t('login.otpCode', 'Verification code')}
              </label>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? t('login.submitting') : t('login.verify', 'Verify and sign in')}
            </button>
            <button
              type="button"
              className="text-sm text-[var(--accent)] hover:underline"
              onClick={() => {
                setOtpId(null);
                setOtpCode('');
              }}
            >
              {t('login.backToLogin', 'Back to sign in')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 card space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-[var(--accent-error)]/10 text-[var(--accent-error)] text-sm">
                {error}
              </div>
            )}
            {captchaSiteKey ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--text-muted)]">
                  {t('login.captchaHint', 'Complete the CAPTCHA, then click Sign in again.')}
                </p>
                <div ref={turnstileRef} className="min-h-[65px]" />
              </div>
            ) : null}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[var(--text)] mb-1">
                {t('login.email')}
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-[var(--text)] mb-1">
                {t('login.password')}
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        )}

        {/* ── Social login ── */}
        <div className="mt-5">
          <div className="relative flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)] shrink-0">or continue with</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {oauth.google === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/google`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-card)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </a>
            ) : (
              <DisabledButton label={t('login.googleUnavailable')} />
            )}
            {oauth.facebook === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/facebook`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-card)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2" aria-hidden>
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </a>
            ) : (
              <DisabledButton label={t('login.facebookUnavailable')} />
            )}
            {oauth.apple === 'LIVE' ? (
              <a
                href={`${API_BASE}/auth/oauth/apple`}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-card)] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple
              </a>
            ) : (
              <DisabledButton label={t('login.appleUnavailable')} />
            )}
          </div>
          {oauth.google !== 'LIVE' && oauth.facebook !== 'LIVE' && oauth.apple !== 'LIVE' && (
            <p className="mt-3 text-xs text-center text-[var(--text-muted)]">
              {t('login.socialUnavailableAll', 'Social sign-in is not configured on this deployment. Use email and password or magic link if enabled.')}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 text-sm text-[var(--text-muted)] text-center">
          <p>
            <Link to="/reset-password" className="text-[var(--accent)] hover:underline">Forgot your password?</Link>
          </p>
          <p>
            Don't have an account?{' '}
            <Link to="/signup" className="text-[var(--accent)] hover:underline font-medium">Create one</Link>
          </p>
          <p>
            <Link to="/help" className="hover:underline">{t('login.helpLink')}</Link>
            {' · '}
            <Link to="/" className="hover:underline">{t('login.homeLink')}</Link>
          </p>
        </div>
      </div>
    </>
  );
}
