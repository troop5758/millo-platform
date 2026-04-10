/**
 * PageErrorBoundary — wraps individual routes so a crash in one page does not
 * take down the entire application. Falls back to a contained error card that
 * lets the user navigate away without losing the rest of the app.
 * https://milloapp.com
 */
import React from 'react';

const COPY = {
  en: { title: 'This page crashed',  body: 'Something went wrong loading this page.', home: 'Back to home', reload: 'Try again' },
  es: { title: 'Esta página falló',  body: 'Algo salió mal al cargar esta página.',  home: 'Inicio',       reload: 'Reintentar' },
  fr: { title: 'Cette page a planté',body: 'Une erreur est survenue sur cette page.', home: 'Accueil',      reload: 'Réessayer' },
  pt: { title: 'Esta página falhou', body: 'Algo correu mal nesta página.',           home: 'Início',       reload: 'Tentar novamente' },
  ar: { title: 'تعطّلت هذه الصفحة',  body: 'حدث خطأ أثناء تحميل هذه الصفحة.',      home: 'الرئيسية',     reload: 'حاول مجددًا' },
};

function getCopy() {
  try {
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return COPY[lang] || COPY.en;
  } catch {
    return COPY.en;
  }
}

export class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary] Page crash caught:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const copy = getCopy();
    return (
      <div
        role="alert"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', padding: 32,
          fontFamily: 'system-ui, sans-serif', textAlign: 'center',
        }}
      >
        <div style={{
          maxWidth: 480, border: '1px solid #fca5a5', borderRadius: 16,
          background: '#fff5f5', padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
            {copy.title}
          </p>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
            {copy.body}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              style={{
                padding: '8px 20px', borderRadius: 10, background: '#7c3aed',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              }}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              {copy.reload}
            </button>
            <a
              href="/"
              style={{
                padding: '8px 20px', borderRadius: 10, border: '1px solid #d1d5db',
                color: '#374151', textDecoration: 'none', fontWeight: 600, fontSize: 14,
                background: '#fff', display: 'inline-flex', alignItems: 'center',
              }}
            >
              {copy.home}
            </a>
          </div>
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <details style={{ marginTop: 20, textAlign: 'left' }}>
              <summary style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer' }}>
                Error details (dev only)
              </summary>
              <pre style={{ fontSize: 11, color: '#dc2626', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.stack || String(this.state.error)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

/** Convenience HOC — wraps a route element with a PageErrorBoundary */
export function withPageErrorBoundary(element) {
  return <PageErrorBoundary>{element}</PageErrorBoundary>;
}
