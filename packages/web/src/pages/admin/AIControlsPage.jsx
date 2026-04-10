import React from 'react';
import { SEO } from '../../components/SEO';
import { useAIControls } from '../../hooks/useAIControls';
function AIControlsContent() {
  const { controls, loading, saving, saved, error, toggle, save, readOnlyPersist } = useAIControls();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">AI Controls</h1>

      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 px-4 py-3 text-sm">
        <strong>Write-enabled.</strong> Saves persist to platform settings and sync shadow mode with <code className="text-xs">ai_shadow_mode</code>.
        Changes are written to the admin audit log. Runtime services may still read environment variables until they are wired to
        the same store — env remains the baseline for new keys.
      </div>

      {readOnlyPersist ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Last save could not be persisted (legacy 501 from an older API); values were reset from the server.
        </div>
      ) : null}

      <p className="text-sm text-[var(--text-muted)] mb-4">
        Loaded values merge the server environment with any saved admin overrides. <strong>Save</strong> updates stored overrides and is audited.
      </p>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 px-4 py-3 text-sm">
          {error.message || 'Request failed.'}
        </div>
      ) : null}

      {!loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-4">
          <label className="flex items-center gap-3 text-[var(--text)]">
            <input
              type="checkbox"
              checked={Boolean(controls.shadowMode)}
              onChange={() => toggle('shadowMode')}
            />
            <span>Shadow Mode</span>
          </label>

          <label className="flex items-center gap-3 text-[var(--text)]">
            <input
              type="checkbox"
              checked={Boolean(controls.moderationEnabled)}
              onChange={() => toggle('moderationEnabled')}
            />
            <span>Moderation Enabled</span>
          </label>

          <label className="flex items-center gap-3 text-[var(--text)]">
            <input
              type="checkbox"
              checked={Boolean(controls.autoActionEnabled)}
              onChange={() => toggle('autoActionEnabled')}
            />
            <span>Auto Action Enabled</span>
          </label>

          <p className="text-sm text-[var(--text-muted)]">
            Model version: <strong className="text-[var(--text)]">{controls.modelVersion || 'unknown'}</strong>
          </p>

          <div className="pt-2 border-t border-[var(--border)] space-y-1 text-sm text-[var(--text-muted)]">
            <p>
              AI optimization (env):{' '}
              <strong className="text-[var(--text)]">{controls.aiOptimizationEnabled !== false ? 'on' : 'off'}</strong>
            </p>
            <p>
              Ranking injection:{' '}
              <strong className="text-[var(--text)]">{controls.rankingInjectionActive ? 'active' : 'inactive'}</strong>
            </p>
            <p>
              Ads AI (timing / audience / bid):{' '}
              <strong className="text-[var(--text)]">{controls.adsAiOptimizationActive ? 'active' : 'inactive'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] text-white px-4 py-2 font-semibold disabled:opacity-50"
              onClick={() => save().catch(() => {})}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saved ? <span className="text-green-600 text-sm">Saved.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AIControlsPage() {
  return (
    <>
      <SEO title="AI controls" path="/admin/ai-controls" />
      <AIControlsContent />
    </>
  );
}
