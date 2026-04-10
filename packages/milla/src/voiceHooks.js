/**
 * Voice hooks — stub hooks for voice in/out. MILLA only acts when policy approves.
 * Force mute: when set, emit out is skipped. https://milloapp.com
 */
const policyEngine = require('./policyEngine');

const hooks = { in: [], out: [] };
let mutedCheck = () => false;

function setMutedCheck(fn) {
  mutedCheck = fn || (() => false);
}

function emitHook(direction, data) {
  if (direction === 'out') {
    policyEngine.requireApproval('voiceOut', data);
    if (mutedCheck(data.streamId)) return;
  }
  for (const fn of hooks[direction] || []) fn(data);
}

function registerHook(direction, fn) {
  if (hooks[direction]) hooks[direction].push(fn);
}

function clearHooks() {
  hooks.in = [];
  hooks.out = [];
}

module.exports = { registerHook, emitHook, clearHooks, setMutedCheck };
