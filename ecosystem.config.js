/**
 * PM2 ecosystem configuration — Millo 3.0
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production   (zero-downtime)
 *   pm2 save                                          (persist process list)
 *   pm2 startup                                       (auto-start on reboot)
 * https://milloapp.com
 */

'use strict';

module.exports = {
  apps: [
    {
      name: 'millo-api',
      script: './packages/api/src/index.js',
      cwd: __dirname,

      // Cluster mode — use all available CPUs
      instances: 'max',
      exec_mode: 'cluster',

      // Graceful shutdown
      kill_timeout: 5000,     // ms to wait before SIGKILL after SIGTERM
      wait_ready: true,       // wait for process.send('ready') before marking as online
      listen_timeout: 10000,  // ms to wait for 'ready' signal

      // Auto-restart on crash, with exponential back-off
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,

      // Gracefully reload on SIGUSR2
      watch: false,

      // Log files
      out_file: './logs/api-out.log',
      error_file: './logs/api-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Environment — production
      env_production: {
        NODE_ENV: 'production',
        // All sensitive values are expected to be set externally (not hardcoded here).
        // Copy .env.example → .env and source it, or use a secret manager.
      },

      // Environment — staging / CI
      env_staging: {
        NODE_ENV: 'staging',
        PORT: '3001',
      },

      // Environment — development (single instance, watch mode)
      env_development: {
        NODE_ENV: 'development',
        PORT: '3000',
        instances: 1,
        exec_mode: 'fork',
        watch: ['packages/api/src'],
        ignore_watch: ['node_modules', 'packages/api/src/__tests__', '*.test.js'],
      },
    },
  ],
};
