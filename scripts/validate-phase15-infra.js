#!/usr/bin/env node
/**
 * Phase 15 — Global Scaling Infrastructure validation
 * Checks: k8s manifests, Cloudflare config, Janus config, media pipeline, Terraform.
 * Run from repo root: npm run validate:phase15-infra
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const required = [
  'infra/k8s/namespace.yaml',
  'infra/k8s/configmap.yaml',
  'infra/k8s/deployment-api.yaml',
  'infra/k8s/deployment-workers.yaml',
  'infra/k8s/deployment-streaming.yaml',
  'infra/k8s/hpa-api.yaml',
  'infra/k8s/ingress.yaml',
  'infra/cloudflare/cdn-rules.md',
  'infra/janus/Dockerfile',
  'infra/janus/janus.jcfg',
  'infra/janus/janus.plugin.streaming.jcfg',
  'infra/janus/deployment.yaml',
  'infra/media/transcode-abl.sh',
  'infra/media/vod-package.sh',
  'infra/media/thumbnail.sh',
  'infra/terraform/main.tf',
  'infra/terraform/variables.tf',
];

const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));

if (missing.length) {
  console.error('[validate-phase15-infra] Missing files:', missing.join(', '));
  process.exit(1);
}

console.log('[validate-phase15-infra] All infra files present.');
console.log('[validate-phase15-infra] Validation passed.');
