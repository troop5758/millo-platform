/**
 * Live mode status — env-derived webrtc / filters contract.
 * https://milloapp.com
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getLiveModeStatus } = require('../services/liveModeStatus.js');

describe('services/liveModeStatus', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns STUBBED webrtc and filters without Janus or LIVE_FILTERS_LIVE', () => {
    vi.stubEnv('JANUS_URL', '');
    vi.stubEnv('JANUS_GATEWAY_URL', '');
    vi.stubEnv('LIVE_FILTERS_LIVE', 'false');
    vi.stubEnv('LIVE_FILTERS_ENABLED', 'false');
    const s = getLiveModeStatus();
    expect(s.webrtc).toBe('STUBBED');
    expect(s.filters).toBe('STUBBED');
  });

  it('returns LIVE webrtc when JANUS_URL is set', () => {
    vi.stubEnv('JANUS_URL', 'https://janus.example/janus');
    vi.stubEnv('LIVE_FILTERS_LIVE', 'false');
    expect(getLiveModeStatus().webrtc).toBe('LIVE');
    expect(getLiveModeStatus().filters).toBe('STUBBED');
  });

  it('returns LIVE filters when LIVE_FILTERS_LIVE=true', () => {
    vi.stubEnv('JANUS_URL', '');
    vi.stubEnv('LIVE_FILTERS_LIVE', 'true');
    expect(getLiveModeStatus().filters).toBe('LIVE');
  });
});
