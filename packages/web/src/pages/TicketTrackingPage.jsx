/**
 * Public ticket tracking page — users can track support tickets by tracking ID.
 * Uses GET /ticket/:trackingId which returns safe, non-PII fields.
 * https://milloapp.com
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { API_BASE } from '../config/api';

export function TicketTrackingPage() {
  const [id, setId] = useState('');
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFetch = async (e) => {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) {
      setError('Please enter a tracking ID.');
      setTicket(null);
      return;
    }
    setLoading(true);
    setError('');
    setTicket(null);
    try {
      const res = await fetch(`${API_BASE}/ticket/${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Ticket not found.');
        setTicket(null);
      } else {
        setTicket(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load ticket.');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO title="Track support ticket" path="/support/track" />
      <div className="p-6 max-w-xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text)]">Track support ticket</h1>
          <Link to="/support/request" className="text-sm text-[var(--accent)] hover:underline">
            Open a new ticket
          </Link>
        </div>

        <form onSubmit={handleFetch} className="space-y-3 mb-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              Tracking ID
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. MIL-1730000000000-123456"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {loading ? 'Checking…' : 'Track'}
          </button>
        </form>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--error)]/10 text-[var(--error)] px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {ticket && !error && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-2">
            <div className="text-xs text-[var(--text-muted)]">
              Tracking ID: <span className="font-mono">{ticket.trackingId || ticket.ticketNumber}</span>
            </div>
            {ticket.subject && (
              <h3 className="text-base font-semibold text-[var(--text)]">
                {ticket.subject}
              </h3>
            )}
            <p className="text-sm text-[var(--text)]">
              Status:{' '}
              <span className="font-medium">
                {ticket.status}
              </span>
            </p>
            {ticket.sla && (
              <p className="text-xs text-[var(--text-muted)]">
                First response target:{' '}
                {ticket.sla.responseDue ? new Date(ticket.sla.responseDue).toLocaleString() : '—'}
                {' · '}
                Resolution target:{' '}
                {ticket.sla.resolutionDue ? new Date(ticket.sla.resolutionDue).toLocaleString() : '—'}
              </p>
            )}
            {ticket.createdAt && (
              <p className="text-xs text-[var(--text-muted)]">
                Created: {new Date(ticket.createdAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

