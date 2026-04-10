/**
 * OAuthCallbackPage — receives token from backend OAuth redirect.
 * URL: /oauth-callback?token=xxx&provider=google
 * Stores the token and redirects to home.
 * https://milloapp.com
 */
import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TOKEN_KEY = 'millo_token';

export function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [params]  = useSearchParams();
  const navigate  = useNavigate();

  useEffect(() => {
    const token    = params.get('token');
    const error    = params.get('error');

    if (error) {
      navigate(`/login?oauth_error=${encodeURIComponent(error)}`, { replace: true });
      return;
    }

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      // Trigger storage event so UserMenu / Layout pick up the new user
      window.dispatchEvent(new Event('storage'));
      navigate('/', { replace: true });
    } else {
      navigate('/login?oauth_error=no_token', { replace: true });
    }
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--text-muted)]">{t('oauthCallback.signingIn')}</p>
      </div>
    </div>
  );
}
