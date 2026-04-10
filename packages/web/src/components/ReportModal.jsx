/**
 * ReportModal — reusable report content/user modal.
 * Usage:
 *   <ReportModal
 *     open={reportOpen}
 *     onClose={() => setReportOpen(false)}
 *     targetType="user"     // "user" | "stream" | "product" | "auction" | "message"
 *     targetId={creator._id}
 *     targetLabel="@username"
 *   />
 * https://milloapp.com
 */
import React, { useState, useCallback } from 'react';
import { getUser } from '../sdk/authApi';
import { reportContent } from '../sdk/contentApi';

const REASONS = [
  { id: 'spam',           label: 'Spam or misleading' },
  { id: 'harassment',     label: 'Harassment or bullying' },
  { id: 'nudity',         label: 'Nudity or sexual content' },
  { id: 'violence',       label: 'Violence or dangerous acts' },
  { id: 'hate_speech',    label: 'Hate speech or discrimination' },
  { id: 'misinformation', label: 'False or misleading information' },
  { id: 'other',          label: 'Other' },
];

export function ReportModal({ open, onClose, targetType, targetId, targetLabel }) {
  const user            = getUser();
  const [reason,      setReason]      = useState('');
  const [description, setDescription] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState('');

  const reset = useCallback(() => {
    setReason(''); setDescription(''); setBusy(false); setDone(false); setError('');
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { setError('Please select a reason.'); return; }
    if (!user)   { setError('You must be logged in to report.'); return; }
    setBusy(true); setError('');
    try {
      await reportContent(targetId, targetType, reason, description);
      setDone(true);
    } catch (e) {
      if (e.message === 'ALREADY_REPORTED') setError('You have already reported this.');
      else setError(e.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-bold text-[var(--text)] text-base">Report</h2>
            {targetLabel && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{targetLabel}</p>
            )}
          </div>
          <button type="button" onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-bold text-[var(--text)] text-base mb-1">Report submitted</p>
              <p className="text-sm text-[var(--text-muted)] mb-5">
                Thanks for letting us know. Our moderation team will review this shortly.
              </p>
              <button type="button" onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                What's the issue? We'll review your report and take action if needed.
              </p>
              <div className="space-y-2 mb-4">
                {REASONS.map((r) => (
                  <label key={r.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      reason === r.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/40'
                    }`}>
                    <input type="radio" name="reason" value={r.id} checked={reason === r.id}
                      onChange={() => setReason(r.id)} className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      reason === r.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                    }`}>
                      {reason === r.id && (
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <span className="text-sm text-[var(--text)]">{r.label}</span>
                  </label>
                ))}
              </div>

              {reason && (
                <div className="mb-4">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Add more details (optional)"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                  />
                </div>
              )}

              {error && (
                <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={busy || !reason}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {busy
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Reporting…</>
                    : 'Submit Report'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Convenience hook + button ── */
export function useReport() {
  const [state, setState] = useState({ open: false, targetType: '', targetId: '', targetLabel: '' });
  const openReport = (targetType, targetId, targetLabel = '') => setState({ open: true, targetType, targetId, targetLabel });
  const closeReport = () => setState((s) => ({ ...s, open: false }));
  return { reportState: state, openReport, closeReport };
}
