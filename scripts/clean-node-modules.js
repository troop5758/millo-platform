'use strict';
/**
 * Remove root node_modules so a fresh npm install can recreate it.
 * On Windows, partial trees (real dirs where symlinks are expected) cause EISDIR.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');

if (!fs.existsSync(nm)) {
  console.log('[clean-node-modules] nothing to remove:', nm);
  process.exit(0);
}

console.log('[clean-node-modules] removing', nm);

if (process.platform === 'win32') {
  try {
    // rd /s /q often succeeds when Node fs.rmSync hits EBUSY (locked files)
    execSync(`cmd /c rmdir /s /q "${nm}"`, { stdio: 'inherit', windowsHide: true });
  } catch {
    console.warn('[clean-node-modules] cmd rmdir failed, trying fs.rmSync…');
    fs.rmSync(nm, { recursive: true, force: true });
  }
} else {
  fs.rmSync(nm, { recursive: true, force: true });
}

if (fs.existsSync(nm)) {
  console.error('[clean-node-modules] FAILED: node_modules still exists. Close editors/AV, retry or delete manually.');
  process.exit(1);
}

console.log('[clean-node-modules] done. Run: npm install   (or see docs/WINDOWS-WORKSPACE-INSTALL.md)');
