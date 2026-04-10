/**
 * @composed-module
 * Not routed directly.
 * Used by:
 * - TicketPage (/support/:ticketId)
 *
 * Thread UI: GET/POST support messages; WS join_ticket / millo:support_new_message.
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { getUser } from '../../sdk/authApi';
import { API_BASE } from '../../config/api';
import { useUserSocket, useSocketEvent } from '../../hooks/useUserSocket';

function fmtDate(d) {
  try {
    return d ? new Date(d).toLocaleString() : '—';
  } catch {
    return '—';
  }
}

function getMessageKey(m) {
  return String(m?._id || m?.id || `${m?.senderId || m?.userId || 'x'}:${m?.createdAt || ''}`);
}

export function SupportTicketPage() {
  const { t } = useTranslation();
  const { ticketId } = useParams();
  const navigate = useNavigate();

  const me = getUser();
  const { joinTicket, leaveTicket } = useUserSocket();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const authToken = useMemo(() => {
    try { return localStorage.getItem('millo_token') || ''; } catch { return ''; }
  }, []);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setError('');
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [ticketRes, msgRes] = await Promise.all([
        fetch(`${API_BASE}/support/${encodeURIComponent(ticketId)}`, { headers }),
        fetch(`${API_BASE}/support/${encodeURIComponent(ticketId)}/messages`, { headers }),
      ]);

      const ticketJson = await ticketRes.json().catch(() => ({}));
      const msgJson = await msgRes.json().catch(() => ({}));

      if (!ticketRes.ok) throw new Error(ticketJson?.error || ticketJson?.message || 'Failed to load ticket');
      if (!msgRes.ok) throw new Error(msgJson?.error || msgJson?.message || 'Failed to load messages');

      setTicket(ticketJson || null);
      setMessages(Array.isArray(msgJson?.messages) ? msgJson.messages : []);
    } catch (e) {
      setError(e.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId, authToken]);

  useEffect(() => {
    if (!me) {
      navigate('/login', { replace: true, state: { from: `/support/${ticketId || ''}` } });
      return;
    }
    loadTicket();
  }, [me, loadTicket, navigate, ticketId]);

  useEffect(() => {
    if (!ticketId) return;
    joinTicket(ticketId);
    return () => leaveTicket(ticketId);
  }, [ticketId, joinTicket, leaveTicket]);

  // Socket updates: when any side posts a new message, backend emits 'new_message'.
  useSocketEvent('millo:support_new_message', useCallback((data) => {
    if (!data) return;
    if (String(data.ticketId) !== String(ticketId)) return;

    const incoming = data;
    const key = getMessageKey(incoming);

    setMessages((prev) => {
      const exists = prev.some((m) => getMessageKey(m) === key);
      if (exists) return prev;
      const next = [...prev, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return next;
    });

    // Update ticket surface fields if we received any ticket patch data (some server paths emit it).
    if (incoming?.ticket) setTicket(incoming.ticket);
  }, [ticketId]));

  const handleSend = async (e) => {
    e.preventDefault();
    if (!ticketId) return;

    const trimmed = body.trim();
    if (!trimmed) return;

    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/support/${encodeURIComponent(ticketId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ body: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || 'Failed to send message');

      // Optimistically append (and socket event will dedupe).
      const incoming = {
        ...data,
        senderId: data.senderId || data.userId,
        senderRole: data.senderRole || data.fromRole,
        message: data.message || data.body,
      };
      setMessages((prev) => {
        const key = getMessageKey(incoming);
        if (prev.some((m) => getMessageKey(m) === key)) return prev;
        return [...prev, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });

      setBody('');
    } catch (e2) {
      setError(e2.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const title = ticket?.subject ? `Ticket: ${ticket.subject}` : 'Support ticket';

  return (
    <>
      <SEO title={title} description={ticket?.trackingId || ticket?.ticketNumber || undefined} path={`/support/${ticketId}`} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('support.ticketThreadTitle', 'Support ticket')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {ticket?.trackingId || ticket?.ticketNumber || ticket?._id ? (
                <>
                  <span className="font-mono">{ticket.trackingId || ticket.ticketNumber || ticket._id}</span>
                </>
              ) : (
                '—'
              )}
              {ticket?.status ? <span> · {ticket.status}</span> : null}
            </p>
          </div>

          <Link to="/support/my" className="text-sm text-[var(--accent)] hover:underline font-medium">
            {t('support.backToMyTickets', 'Back to tickets')}
          </Link>
        </div>

        {loading && (
          <div className="py-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--error)]">
            {error}
          </div>
        )}

        {!loading && !error && !ticket && (
          <div className="py-16 text-center text-[var(--text-muted)]">
            {t('support.ticketNotFound', 'Ticket not found.')}
          </div>
        )}

        {!loading && ticket && (
          <>
            {/* Ticket summary */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-muted)]">{t('support.subject', 'Subject')}</div>
                  <div className="text-base font-semibold text-[var(--text)] truncate">{ticket.subject || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-[var(--text-muted)]">{t('support.created', 'Created')}</div>
                  <div className="text-sm font-medium text-[var(--text)]">{fmtDate(ticket.createdAt)}</div>
                </div>
              </div>
            </div>

            {/* Message thread */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
                {messages.length === 0 && (
                  <div className="text-center py-10 text-sm text-[var(--text-muted)]">
                    {t('support.noMessages', 'No messages yet.')}
                  </div>
                )}

                {messages.map((m) => {
                  const fromMe = String(m.senderId) === String(me?._id || me?.id);
                  const role = (m.senderRole || '').toLowerCase();
                  const badge =
                    role === 'admin' ? t('support.role.admin', 'Admin') :
                      role === 'support' ? t('support.role.support', 'Support') :
                        t('support.role.user', 'User');

                  return (
                    <div key={getMessageKey(m)} className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 border ${fromMe ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--bg)]'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-[var(--text-muted)]">{badge}</span>
                          <span className="text-xs text-[var(--text-muted)]">·</span>
                          <span className="text-xs text-[var(--text-muted)]">{fmtDate(m.createdAt)}</span>
                        </div>
                        <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words">{m.message || m.body || ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <form onSubmit={handleSend} className="mt-4 flex gap-3">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={2}
                  placeholder={t('support.messagePlaceholder', 'Write a message...')}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !body.trim()}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors"
                >
                  {sending ? '…' : t('common.send', 'Send')}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}

