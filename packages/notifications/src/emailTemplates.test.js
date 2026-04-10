/**
 * Validation: Emails render correctly — logo embedded, dark/light structure.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const branding = require('./branding');
const {
  getBaseTemplate,
  renderEmail,
  renderEmailLight,
  renderEmailDark,
} = require('./emailTemplates');

describe('Emails render correctly', () => {
  it('base template contains logo img with branding URL', () => {
    const html = getBaseTemplate();
    const logoUrl = branding.getLogoUrl();
    assert.ok(html.includes('<img'), 'must contain img');
    assert.ok(html.includes(logoUrl), 'must embed logo URL');
    assert.ok(html.includes('alt='), 'must have alt for logo');
  });

  it('renderEmail contains logo and content placeholders replaced', () => {
    const html = renderEmail({ title: 'Hello', body: 'World' });
    assert.ok(html.includes(branding.getLogoUrl()), 'logo present');
    assert.ok(html.includes('Hello'), 'title rendered');
    assert.ok(html.includes('World'), 'body rendered');
    assert.ok(html.includes('prefers-color-scheme') || html.includes('color-scheme'), 'dark/light support');
  });

  it('renderEmailLight has light background and logo', () => {
    const html = renderEmailLight({ title: 'Test', body: 'Body' });
    assert.ok(html.includes('#fff') || html.includes('background') || html.includes('ffffff'), 'light styling');
    assert.ok(html.includes(branding.getLogoUrl()), 'logo present');
    assert.ok(html.includes('Test') && html.includes('Body'));
  });

  it('renderEmailDark has dark background and logo', () => {
    const html = renderEmailDark({ title: 'Test', body: 'Body' });
    assert.ok(html.includes('#1a1a1a') || html.includes('1a1a1a'), 'dark background');
    assert.ok(html.includes(branding.getLogoUrl()), 'logo present');
    assert.ok(html.includes('Test') && html.includes('Body'));
  });

  it('HTML is valid structure (doctype, html, body)', () => {
    const html = renderEmail({ title: 'T', body: 'B' });
    assert.ok(html.includes('<!DOCTYPE html>'), 'doctype');
    assert.ok(html.includes('<html'), 'html');
    assert.ok(html.includes('<body'), 'body');
  });
});
