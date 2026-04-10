/**
 * Non-interactive control for unavailable actions (e.g. OAuth not configured).
 * https://milloapp.com
 */
export function DisabledButton({ label, className = '' }) {
  return (
    <span
      role="button"
      aria-disabled="true"
      title={label}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] text-sm font-medium cursor-not-allowed opacity-70 select-none ${className}`.trim()}
    >
      {label}
    </span>
  );
}
