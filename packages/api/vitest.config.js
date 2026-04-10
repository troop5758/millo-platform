/**
 * Vitest config — no `vitest/config` import so installs without hoisted vitest still parse this file.
 * Run from repo root after `npm install`: `npm test -w @millo/api`
 * https://milloapp.com
 */
export default {
  test: {
    env: {
      EMAIL_PROVIDER: 'console',
    },
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.{js,ts}', 'src/**/*.test.{js,ts}'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/routes/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
};
