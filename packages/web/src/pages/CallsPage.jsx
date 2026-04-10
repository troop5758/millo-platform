/**
 * CallsPage — paid audio/video calls (DM monetization).
 * Lists call history, request/join/end calls, creator approval.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import {
  fetchCallsConfig,
  fetchCallSessions,
  requestCall,
  endCall,
  approveCall,
} from '../sdk/contentApi';
import { getToken } from '../sdk/authApi';
import { getUser } from '../sdk/authApi';
import { getApiBase } from '../config/api.js';

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(m) {
  if (m == null || m === 0) return '0m';
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function Avatar({ name, url, size = 10 }) {
  const px = size * 4;
  const initials = (name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      className="rounded-full bg-[var(--accent)] overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0"
    >
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

export default function CallsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [config, setConfig] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSessionId, setActionSessionId] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [ws, setWs] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const c = await fetchCallsConfig();
      setConfig(c);
    } catch (e) {
      setError(e.message || 'Failed to load config');
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchCallSessions(50, 0);
      setSessions(data.sessions || []);
      setTotal(data.total ?? 0);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadConfig();
    loadSessions();
  }, [user, navigate, loadConfig, loadSessions]);

  const handleEndCall = async (sessionId) => {
    setActionSessionId(sessionId);
    try {
      await endCall(sessionId);
      setActiveCall(null);
      setWs((w) => { if (w) w.close(); return null; });
      await loadSessions();
    } catch (e) {
      setError(e.message || 'Failed to end call');
    } finally {
      setActionSessionId(null);
    }
  };

  const handleApprove = async (sessionId) => {
    setActionSessionId(sessionId);
    try {
      await approveCall(sessionId);
      await loadSessions();
    } catch (e) {
      setError(e.message || 'Failed to approve');
    } finally {
      setActionSessionId(null);
    }
  };

  const joinMeeting = (session) => {
    if (session.endedAt) return;
    const token = getToken();
    const base = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase()).replace(/^http/, 'ws');
    const wsUrl = `${base}/ws/meeting/${session._id}${token ? `?token=${token}` : ''}`;
    setActiveCall(session);
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setWs(socket);
    socket.onclose = () => { setWs(null); setActiveCall(null); };
    socket.onerror = () => { setWs(null); setActiveCall(null); };
    setWs(socket);
  };

  const leaveMeeting = () => {
    if (activeCall) handleEndCall(activeCall._id);
    setWs((w) => { if (w) w.close(); return null; });
    setActiveCall(null);
  };

  if (!user) return null;

  return (
    <>
      <SEO title={t('calls.title')} />
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-[var(--text)]">{t('calls.title')}</h1>
            <Link
              to="/messages"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {t('calls.backToMessages')}
            </Link>
          </div>

          {config && (
            <div className="mb-6 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
              <p className="text-sm text-[var(--text-muted)]">
                {t('calls.pricingInfo', {
                  free: config.freeBufferMinutes,
                  rate: (config.centsPerMinute / 100).toFixed(2),
                  max: config.maxSessionMinutes,
                })}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {activeCall && (
            <div className="mb-6 p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={activeCall.otherDisplayName} url={activeCall.otherAvatarUrl} size={12} />
                  <div>
                    <p className="font-semibold text-[var(--text)]">{activeCall.otherDisplayName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{t('calls.inCall')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={leaveMeeting}
                  disabled={actionSessionId === activeCall._id}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {t('calls.endCall')}
                </button>
              </div>
              {ws && ws.readyState === WebSocket.OPEN && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">{t('calls.connected')}</p>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <p className="text-[var(--text-muted)] font-medium">{t('calls.noCalls')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{t('calls.noCallsDesc')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                {t('calls.requestFromProfile')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const isActive = !s.endedAt;
                const needsApproval = s.isCreator && s.endedAt && !s.approved;
                return (
                  <div
                    key={s._id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]"
                  >
                    <Avatar name={s.otherDisplayName} url={s.otherAvatarUrl} size={12} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[var(--text)] truncate">{s.otherDisplayName}</p>
                        <span className="text-xs text-[var(--text-muted)] shrink-0">{formatDate(s.startedAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-muted)]">
                        <span>{formatMinutes(s.totalMinutes)}</span>
                        {s.amountCents > 0 && <span>{(s.amountCents / 100).toFixed(2)}</span>}
                        {isActive && <span className="text-[var(--accent)] font-medium">{t('calls.active')}</span>}
                        {needsApproval && <span className="text-amber-600">{t('calls.pendingApproval')}</span>}
                        {s.approved && <span className="text-green-600">{t('calls.completed')}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => joinMeeting(s)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
                        >
                          {t('calls.join')}
                        </button>
                      )}
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleEndCall(s._id)}
                          disabled={actionSessionId === s._id}
                          className="px-3 py-1.5 rounded-lg border border-red-500 text-red-500 text-sm font-medium hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {t('calls.endCall')}
                        </button>
                      )}
                      {needsApproval && (
                        <button
                          type="button"
                          onClick={() => handleApprove(s._id)}
                          disabled={actionSessionId === s._id}
                          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {t('calls.approve')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
