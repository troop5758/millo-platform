import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { StaffAuthProvider } from './context/StaffAuth';
import { CartProvider } from './context/CartContext';
import App from './App';
import './index.css';
import './i18n';

// Sentry error monitoring — only active when DSN is configured
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn:              SENTRY_DSN,
    environment:      import.meta.env.MODE || 'production',
    release:          import.meta.env.VITE_APP_VERSION || '3.0.0',
    tracesSampleRate: 0.1, // 10% of transactions
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.05,
    beforeSend(event) {
      // Strip auth tokens from breadcrumb URLs
      if (event.request?.headers?.Authorization) {
        event.request.headers.Authorization = '[Filtered]';
      }
      return event;
    },
  });
}

// Register service worker for PWA + offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => {})
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StaffAuthProvider>
      <CartProvider>
        <App />
      </CartProvider>
    </StaffAuthProvider>
  </React.StrictMode>
);
