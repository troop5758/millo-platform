/**
 * PM2 ecosystem — Millo 3.0
 * Production: https://milloapp.com
 */
module.exports = {
  apps: [
    { name: 'millo-api', cwd: 'packages/api', script: 'src/index.js', instances: 1 },
    { name: 'millo-workers', cwd: 'packages/workers', script: 'src/index.js', instances: 1 },
  ],
};
