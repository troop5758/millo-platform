/**
 * Email templates — logo embedded, dark/light. https://milloapp.com
 */
const branding = require('./branding');

const LOGO_PLACEHOLDER = '{{LOGO_URL}}';
const TITLE_PLACEHOLDER = '{{TITLE}}';
const BODY_PLACEHOLDER = '{{BODY}}';
const CTA_URL_PLACEHOLDER = '{{CTA_URL}}';
const CTA_TEXT_PLACEHOLDER = '{{CTA_TEXT}}';

/**
 * Base HTML with logo and dark/light support (prefers-color-scheme).
 * Logo is embedded via img src (use LOGO_URL for inline embedding in clients that support it).
 */
function getBaseTemplate() {
  const logoUrl = branding.getLogoUrl();
  const appName = branding.getAppName();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <style>
    :root { --bg: #ffffff; --text: #1a1a1a; --muted: #666; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #1a1a1a; --text: #f0f0f0; --muted: #aaa; }
    }
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .container { max-width: 560px; margin: 0 auto; }
    .logo { display: block; margin-bottom: 24px; }
    .logo img { max-height: 48px; width: auto; }
    h1 { font-size: 20px; margin: 0 0 16px; }
    .body { color: var(--muted); line-height: 1.5; margin-bottom: 24px; }
    .cta { display: inline-block; padding: 12px 24px; background: #0066cc; color: #fff !important; text-decoration: none; border-radius: 8px; }
    .footer { margin-top: 32px; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><img src="${logoUrl}" alt="${appName}" width="140" height="48"></div>
    {{CONTENT}}
    <p class="footer">&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
  </div>
</body>
</html>`;
}

/**
 * Render transactional email with title, body, optional CTA. Logo embedded via img src.
 */
function renderEmail(options = {}) {
  const { title = '', body = '', ctaUrl = '', ctaText = '' } = options;
  const base = getBaseTemplate();
  const content = [
    title ? `<h1>${escapeHtml(title)}</h1>` : '',
    body ? `<div class="body">${escapeHtml(body).replace(/\n/g, '<br>')}</div>` : '',
    ctaUrl && ctaText ? `<a href="${escapeHtml(ctaUrl)}" class="cta">${escapeHtml(ctaText)}</a>` : '',
  ].filter(Boolean).join('\n');
  return base.replace('{{CONTENT}}', content);
}

/**
 * Light-only template (for clients that don't support prefers-color-scheme).
 */
function renderEmailLight(options = {}) {
  const { title = '', body = '', ctaUrl = '', ctaText = '' } = options;
  const logoUrl = branding.getLogoUrl();
  const appName = branding.getAppName();
  const content = [
    `<div class="logo"><img src="${logoUrl}" alt="${appName}" width="140" height="48"></div>`,
    title ? `<h1>${escapeHtml(title)}</h1>` : '',
    body ? `<div class="body">${escapeHtml(body).replace(/\n/g, '<br>')}</div>` : '',
    ctaUrl && ctaText ? `<a href="${escapeHtml(ctaUrl)}" class="cta">${escapeHtml(ctaText)}</a>` : '',
  ].filter(Boolean).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;font-family:system-ui;background:#fff;color:#1a1a1a"><div style="max-width:560px;margin:0 auto">${content}<p style="margin-top:32px;font-size:12px;color:#666">&copy; ${new Date().getFullYear()} ${appName}</p></div></body></html>`;
}

/**
 * Dark-only template.
 */
function renderEmailDark(options = {}) {
  const { title = '', body = '', ctaUrl = '', ctaText = '' } = options;
  const logoUrl = branding.getLogoUrl();
  const appName = branding.getAppName();
  const content = [
    `<div class="logo"><img src="${logoUrl}" alt="${appName}" width="140" height="48"></div>`,
    title ? `<h1>${escapeHtml(title)}</h1>` : '',
    body ? `<div class="body">${escapeHtml(body).replace(/\n/g, '<br>')}</div>` : '',
    ctaUrl && ctaText ? `<a href="${escapeHtml(ctaUrl)}" class="cta">${escapeHtml(ctaText)}</a>` : '',
  ].filter(Boolean).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;font-family:system-ui;background:#1a1a1a;color:#f0f0f0"><div style="max-width:560px;margin:0 auto">${content}<p style="margin-top:32px;font-size:12px;color:#aaa">&copy; ${new Date().getFullYear()} ${appName}</p></div></body></html>`;
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  getBaseTemplate,
  renderEmail,
  renderEmailLight,
  renderEmailDark,
  LOGO_PLACEHOLDER,
  TITLE_PLACEHOLDER,
  BODY_PLACEHOLDER,
  CTA_URL_PLACEHOLDER,
  CTA_TEXT_PLACEHOLDER,
};
