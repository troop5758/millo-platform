/**
 * DMPage — direct messages UI with conversation list + thread view.
 * Uses /dm/conversations, /dm/conversation/:userId/messages, /dm/messages
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { fetchConversations, fetchMessages, sendMessage, markConversationRead } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { useUserSocket, useSocketEvent } from '../hooks/useUserSocket';

function markRead(userId) {
  markConversationRead(userId).catch(() => null);
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return 'now';
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Avatar({ name, url, size = 10 }) {
  const initials = (name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`w-${size} h-${size} rounded-full bg-[var(--accent)] overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

/* ── Conversation list panel ── */
function ConversationList({ convos, loading, error, selectedId, onSelect }) {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full border-r border-[var(--border)] bg-[var(--bg-elevated)] flex flex-col">
      <div className="px-4 py-4 border-b border-[var(--border)]">
        <h2 className="text-base font-bold text-[var(--text)]">{t('dm.title')}</h2>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : convos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <svg className="w-12 h-12 text-[var(--text-muted)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm text-[var(--text-muted)]">{t('dm.noConversations')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t('dm.noConversationsDesc')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {convos.map((c) => (
            <button key={c.userId} type="button" onClick={() => onSelect(c)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-[var(--border)] hover:bg-[var(--bg-card)] ${
                selectedId === c.userId ? 'bg-[var(--accent-subtle)]' : ''
              }`}>
              <Avatar name={c.displayName} url={c.avatarUrl} size={10} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{c.displayName}</p>
                  <span className="text-xs text-[var(--text-muted)] shrink-0 ml-1">
                    {timeAgo(c.lastMessage?.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                  {c.lastMessage ? (c.lastMessage.fromMe ? t('dm.you') + ': ' : '') + c.lastMessage.body : t('dm.noMessages')}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  {c.unreadCount > 9 ? '9+' : c.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Message thread panel ── */
function MessageThread({ convo, me, onRead }) {
  const { t } = useTranslation();
  const [messages,    setMessages]    = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [isTyping,    setIsTyping]    = useState(false);
  const [readByOther, setReadByOther] = useState(false); // did the other user read our last msg?
  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const { sendTyping } = useUserSocket();

  const [msgError,  setMsgError]  = useState('');
  const [sendError, setSendError] = useState('');

  const load = useCallback(async () => {
    if (!convo?.userId) return;
    try {
      const msgs = await fetchMessages(convo.userId);
      setMessages(msgs);
      setMsgError('');
    } catch (e) {
      setMessages([]);
      setMsgError(e.message || t('common.error'));
    }
    setLoadingMsgs(false);
  }, [convo?.userId]);

  useEffect(() => {
    setLoadingMsgs(true);
    setMessages([]);
    setReadByOther(false);
    load();
    // Mark incoming messages as read when the thread is opened
    markRead(convo.userId);
    onRead?.(convo.userId);
    // Poll every 10s as fallback
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load, convo?.userId]);

  // Real-time: new incoming message pushed via WebSocket
  useSocketEvent('millo:dm_message', useCallback((msg) => {
    if (String(msg.fromUserId) !== String(convo?.userId)) return;
    setMessages((prev) => {
      if (prev.some((m) => m._id === msg._id)) return prev;
      return [...prev, msg];
    });
    setIsTyping(false);
  }, [convo?.userId]));

  // Real-time: typing indicator from conversation partner
  useSocketEvent('millo:typing', useCallback((data) => {
    if (String(data.fromUserId) !== String(convo?.userId)) return;
    setIsTyping(data.isTyping);
    if (data.isTyping) {
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsTyping(false), 4000);
    }
  }, [convo?.userId]));

  // Real-time: other user read our messages
  useSocketEvent('millo:dm_read', useCallback((data) => {
    if (String(data.byUserId) !== String(convo?.userId)) return;
    setReadByOther(true);
  }, [convo?.userId]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError('');
    const optimistic = {
      _id: 'opt_' + Date.now(),
      senderId: me?._id ?? 'me',
      receiverId: convo.userId,
      body,
      createdAt: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    try {
      const sent = await sendMessage(convo.userId, body);
      setMessages((prev) => prev.map((m) => m._id === optimistic._id ? (sent.message || optimistic) : m));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      setInput(body);
      setSendError(e.message || t('common.error'));
    }
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    // Send typing indicator via WebSocket
    sendTyping(convo.userId, true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(convo.userId, false), 2000);
  };

  if (!convo) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <svg className="w-16 h-16 text-[var(--text-muted)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p className="text-[var(--text-muted)] font-medium">{t('dm.noConversations')}</p>
    </div>
  );

  const myId = String(me?._id ?? '');

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <Avatar name={convo.displayName} url={convo.avatarUrl} size={9} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] truncate">{convo.displayName}</p>
          <Link to={`/creator/${convo.userId}`}
            className="text-xs text-[var(--accent)] hover:underline">
            {t('common.view')}
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {msgError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{msgError}</span>
            <button type="button" onClick={load} className="ml-auto underline text-xs hover:no-underline">
              {t('common.retry')}
            </button>
          </div>
        )}
        {loadingMsgs ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 && !msgError ? (
          <p className="text-center text-sm text-[var(--text-muted)] py-10">
            {t('dm.noMessages')}
          </p>
        ) : (
          messages.map((msg, idx) => {
            const fromMe   = String(msg.senderId) === myId;
            const isLast   = idx === messages.length - 1;
            const showRead = fromMe && isLast && readByOther;
            const showSent = fromMe && isLast && !readByOther && !msg._optimistic;
            return (
              <div key={msg._id} className={`flex flex-col ${fromMe ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                  fromMe
                    ? 'bg-[var(--accent)] text-white rounded-br-sm'
                    : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] rounded-bl-sm'
                } ${msg._optimistic ? 'opacity-60' : ''}`}>
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p className={`text-[10px] mt-1 ${fromMe ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                    {timeAgo(msg.createdAt)}
                  </p>
                </div>
                {/* Read receipt */}
                {(showRead || showSent) && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 mr-0.5">
                    {showRead ? `✓✓ ${t('dm.readReceipt')}` : `✓ ${t('dm.sent')}`}
                  </p>
                )}
              </div>
            );
          })
        )}
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-2 pl-1 pb-1">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <span className="text-xs text-[var(--text-muted)]">{convo.displayName}…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
        {sendError && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="flex-1">{sendError}</span>
            <button type="button" onClick={() => setSendError('')} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            placeholder={t('dm.typeMessage')}
            className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] max-h-32"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-10 h-10 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 shrink-0"
          >
            <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 text-right">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

/* ── Main DMPage ── */
export function DMPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const me              = getUser();

  const [convos,   setConvos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [convError, setConvError] = useState('');
  const [selected, setSelected] = useState(null);

  // If ?user= param present, pre-select that conversation
  const paramUser = searchParams.get('user');

  useEffect(() => {
    if (!me) { navigate('/login', { replace: true }); return; }
    fetchConversations()
      .then((c) => {
        setConvos(c);
        setConvError('');
        if (paramUser) {
          const found = c.find((x) => x.userId === paramUser);
          if (found) setSelected(found);
          else setSelected({ userId: paramUser, displayName: paramUser, avatarUrl: null, unreadCount: 0, lastMessage: null });
        }
      })
      .catch((e) => {
        setConvError(e.message || t('common.error'));
        if (paramUser) {
          setSelected({ userId: paramUser, displayName: paramUser, avatarUrl: null, unreadCount: 0, lastMessage: null });
        }
      })
      .finally(() => setLoading(false));
  }, [me, navigate, paramUser]);

  return (
    <>
      <SEO title="Messages – Millo" description="Your direct messages on Millo." path="/messages" />
      <div className="grid grid-cols-1 md:grid-cols-3 h-[calc(100vh-56px)] overflow-hidden">
        {/* On mobile: show list OR thread based on selection */}
        <div className={`${selected ? 'hidden md:block' : 'block'} md:col-span-1 overflow-hidden`}>
          <ConversationList
            convos={convos}
            loading={loading}
            error={convError}
            selectedId={selected?.userId}
            onSelect={setSelected}
          />
        </div>

        {selected && (
          <div className="md:col-span-2 flex flex-col min-w-0 overflow-hidden">
            {/* Mobile back button */}
            <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
              <button type="button" onClick={() => setSelected(null)}
                className="text-[var(--accent)] text-sm font-medium flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('common.back')}
              </button>
            </div>
            <MessageThread
              convo={selected}
              me={me}
              onRead={(userId) => {
                setConvos((prev) =>
                  prev.map((c) => c.userId === userId ? { ...c, unreadCount: 0 } : c)
                );
              }}
            />
          </div>
        )}

        {!selected && !loading && (
          <div className="hidden md:flex md:col-span-2 items-center justify-center text-center p-8">
            <div>
              <svg className="w-16 h-16 text-[var(--text-muted)] mb-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-[var(--text-muted)] font-medium">{t('dm.noConversations')}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('dm.noConversationsDesc')}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
