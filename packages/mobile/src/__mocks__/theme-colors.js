'use strict';
// Aligned with packages/mobile/src/theme/colors.js (Millo design system)
const dark = {
  bg: '#0d0d0d', bgCard: '#1e1e1e', text: '#f1f5f9', textMuted: '#64748b',
  accent: '#3b6fff', border: '#272727', accentLive: '#e53e3e', accentSuccess: '#16a34a',
  red: '#e53e3e', green: '#16a34a',
};
const light = { ...dark, bg: '#f4f6fa', bgCard: '#ffffff', text: '#0f172a', border: '#e2e8f0' };
module.exports = { dark, light };
