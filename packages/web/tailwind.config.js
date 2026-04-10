/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-live': 'var(--accent-live)',
        'accent-premium': 'var(--accent-premium)',
        'accent-success': 'var(--accent-success)',
        'accent-warning': 'var(--accent-warning)',
        'accent-error': 'var(--accent-error)',
        bg: { DEFAULT: 'var(--bg)', elevated: 'var(--bg-elevated)', card: 'var(--bg-card)' },
        border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        muted: 'var(--text-muted)',
      },
    },
  },
  plugins: [],
};
