/**
 * PM2 — Millo 3.0. Ubuntu 22.04. Boot on restart via pm2 startup.
 * Bind: https://milloapp.com, api.milloapp.com
 */
const path = require('path');
const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'millo-api',
      cwd: path.join(root, 'packages/api'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      env_file: path.join(root, '.env'),
    },
    {
      name: 'millo-workers',
      cwd: path.join(root, 'packages/workers'),
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      env_file: path.join(root, '.env'),
    },
  ],
};
