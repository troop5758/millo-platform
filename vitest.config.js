'use strict';
const path = require('path');
const root = __dirname;

module.exports = {
  resolve: {
    alias: {
      '@millo/database': path.resolve(root, 'packages/database/src/index.js'),
      '@millo/live': path.resolve(root, 'packages/live/src/index.js'),
      '@millo/milla': path.resolve(root, 'packages/milla/src/index.js'),
      '@millo/billing': path.resolve(root, 'packages/billing/src/index.js'),
      '@millo/economy': path.resolve(root, 'packages/economy/src/index.js'),
      '@millo/notifications': path.resolve(root, 'packages/notifications/src/index.js'),
      '@millo/compliance': path.resolve(root, 'packages/compliance/src/index.js'),
      '@millo/dashboards': path.resolve(root, 'packages/dashboards/src/index.js'),
      '@millo/level-trust': path.resolve(root, 'packages/level-trust/src/index.js'),
      '@millo/tv': path.resolve(root, 'packages/tv/src/index.js'),
      '@millo/self-observation': path.resolve(root, 'packages/self-observation/src/index.js'),
      '@millo/security': path.resolve(root, 'packages/security/src/index.js'),
    },
  },
  test: {
    include: [
      'packages/web/src/**/__tests__/**/*.test.{js,jsx}',
      'packages/api/src/__tests__/**/*.test.{js,ts}',
    ],
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    setupFiles: ['packages/api/src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'packages/web/src/sdk/**',
        'packages/api/src/routes/**',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
};
