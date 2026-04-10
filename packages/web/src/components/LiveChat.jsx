/**
 * LiveChat — real-time chat panel for a live stream.
 * Connects to /live/ws?streamId= for viewer count + chat messages.
 * Passes auth token for persisted messages; fetches initial history.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getUser, getToken } from '../sdk/authApi';
import { fetchStreamChat } from '../sdk/contentApi';
import { getApiBase } from '../config/api.js';
import { features } from '../config/features';

const WS_BASE = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase())
  .replace(/^http/, 'ws');

const COLORS = [
  'text-violet-400', 'text-sky-400', 'text-emerald-400',
  'text-amber-400', 'text-rose-400', 'text-teal-400',
];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return COLORS[h % COLORS.length];
}

/** TikTok-style quick emoji reactions */
const QUICK_EMOJIS = ['🔥', '❤️', '👍', '😂', '😮', '🎉', '👏', '💯'];

export function LiveChat({
  streamId,
  onViewerCount,
  onProductDrop,
  onAuctionStarted,
  onGiftReceived,
  onSendGiftReady,
  onReactionReceived,
  onReactionBurst,
  onModerationState,
  isModerator = false,
  moderationState: externalModState,
  className = '',
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [modState, setModState] = useState({ chatMuted: false, reactionsDisabled: false, giftsBlocked: false });
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const user = getUser();
  const mod = externalModState ?? modState;
  const setModeration = useCallback((next) => {
    setModState(next);
    if (onModerationState) onModerationState(next);
  }, [onModerationState]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Fetch initial chat history on mount
  useEffect(() => {
    if (!streamId) return;
    fetchStreamChat(streamId)
      .then((msgs) => {
        setMessages((msgs || []).map((m) => ({
          id: m.messageId || m._id || String(m.ts || Date.now()),
          displayName: m.displayName || t('live.viewer'),
          text: m.text || '',
          ts: m.ts ?? m.createdAt ?? Date.now(),
        })));
      })
      .catch(() => {});
  }, [streamId, t]);

  useEffect(() => {
    if (!streamId) return;
    let retryTimer = null;
    const token = getToken();

    function connect() {
      let url = `${WS_BASE}/live/ws?streamId=${encodeURIComponent(streamId)}`;
      if (token) url += `&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setConnected(true);
        if (onSendGiftReady && features.liveGifts) {
          onSendGiftReady((giftId, coins, fingerprint) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
            wsRef.current.send(JSON.stringify({
              type: 'send_gift',
              data: {
                gift_id: giftId,
                coins,
                timestamp: Date.now(),
                fingerprint: fingerprint || undefined,
                nonce: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : undefined,
              },
            }));
            return true;
          });
        }
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.type === 'viewer_count' && onViewerCount) {
          onViewerCount(msg.count ?? msg.data?.count);
        }
        if (msg.type === 'chat' || msg.type === 'new_message') {
          setMessages((prev) => [...prev.slice(-199), {
            id:          msg.messageId || Date.now() + Math.random(),
            displayName: msg.displayName || msg.user?.displayName || t('live.viewer'),
            text:        msg.text || msg.message || '',
            ts:          msg.ts ?? msg.timestamp ?? Date.now(),
          }]);
        }
        if (msg.type === 'product_drop' && onProductDrop) {
          onProductDrop(msg);
        }
        if (msg.type === 'auction_started' && onAuctionStarted) {
          onAuctionStarted(msg);
        }
        if (msg.type === 'gift_sent' && onGiftReceived) {
          onGiftReceived(msg);
        }
        if (msg.type === 'live_reaction') {
          setReactions((prev) => [...prev.slice(-49), { ...msg, key: Date.now() + Math.random() }]);
          if (onReactionReceived) onReactionReceived(msg);
        }
        if (msg.type === 'reaction_burst') {
          if (onReactionBurst) onReactionBurst(msg);
          setReactions((prev) => [...prev.slice(-49), { emoji: msg.emoji, displayName: `${msg.count} viewers`, key: Date.now() + Math.random() }]);
        }
        if (msg.type === 'moderation_state') {
          const next = {
            chatMuted: !!msg.chatMuted,
            reactionsDisabled: !!msg.reactionsDisabled,
            giftsBlocked: !!msg.giftsBlocked,
          };
          setModeration(next);
        }
      });

      ws.addEventListener('close', () => {
        setConnected(false);
        if (onSendGiftReady) onSendGiftReady(null);
        retryTimer = setTimeout(connect, 4000);
      });
      ws.addEventListener('error', () => ws.close());
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [streamId, onViewerCount, onProductDrop, onAuctionStarted, onGiftReceived, onSendGiftReady, onReactionReceived, onReactionBurst]);

  const sendReaction = useCallback((emoji) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'live_reaction',
      data: { emoji, timestamp: Date.now() },
    }));
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      text,
      displayName: user?.displayName || user?.username || t('live.viewer'),
    }));
    // Optimistic: add own message immediately
    setMessages((prev) => [...prev.slice(-199), {
      id:          Date.now(),
      displayName: user?.displayName || t('live.you'),
      text,
      ts:          Date.now(),
      own:         true,
    }]);
    setInput('');
  }, [input, user]);

  return (
    <div className={`flex flex-col bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-sm font-bold text-[var(--text)]">Live Chat</h3>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-[var(--text-muted)]">{connected ? 'Live' : 'Connecting…'}</span>
        </div>
      </div>

      {/* Moderator controls: mute chat, disable reactions, block gifts */}
      {isModerator && user && features.liveModerators && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card)]/50">
          <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">Mod:</span>
          <button
            type="button"
            onClick={() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: mod.chatMuted ? 'mod_enable_chat' : 'mod_mute_chat' }))}
            disabled={!connected}
            className={`text-xs px-2 py-1 rounded ${mod.chatMuted ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-[var(--border)] text-[var(--text-muted)]'} hover:opacity-90 disabled:opacity-50`}
          >
            {mod.chatMuted ? 'Unmute chat' : 'Mute chat'}
          </button>
          <button
            type="button"
            onClick={() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: mod.reactionsDisabled ? 'mod_enable_reactions' : 'mod_disable_reactions' }))}
            disabled={!connected}
            className={`text-xs px-2 py-1 rounded ${mod.reactionsDisabled ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-[var(--border)] text-[var(--text-muted)]'} hover:opacity-90 disabled:opacity-50`}
          >
            {mod.reactionsDisabled ? 'Enable reactions' : 'Disable reactions'}
          </button>
          <button
            type="button"
            onClick={() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({ type: mod.giftsBlocked ? 'mod_enable_gifts' : 'mod_block_gifts' }))}
            disabled={!connected}
            className={`text-xs px-2 py-1 rounded ${mod.giftsBlocked ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-[var(--border)] text-[var(--text-muted)]'} hover:opacity-90 disabled:opacity-50`}
          >
            {mod.giftsBlocked ? 'Allow gifts' : 'Block gifts'}
          </button>
        </div>
      )}

      {/* TikTok-style quick emoji reactions */}
      {user && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border)]">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => sendReaction(emoji)}
              disabled={!connected || mod.reactionsDisabled}
              className="w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-[var(--bg-card)] disabled:opacity-40 transition-colors"
              aria-label={`React ${emoji}`}
              title={mod.reactionsDisabled ? t('live.reactionsDisabled', 'Reactions disabled') : undefined}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Inline reaction display (last few) */}
      {reactions.length > 0 && (
        <div className="px-3 py-1 flex flex-wrap gap-1 min-h-0 overflow-hidden" style={{ maxHeight: '36px' }}>
          {reactions.slice(-8).map((r) => (
            <span key={r.key} className="text-xs">
              <span className="font-medium text-[var(--text-muted)]">{r.displayName || 'Viewer'}</span>
              <span className="ml-0.5">{r.emoji}</span>
            </span>
          ))}
        </div>
      )}
      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0" style={{ maxHeight: '320px' }}>
        {messages.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">Chat will appear here…</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm leading-snug">
            <span className={`font-semibold mr-1.5 ${m.own ? 'text-[var(--accent)]' : colorFor(m.displayName)}`}>
              {m.displayName}
            </span>
            <span className="text-[var(--text)]">{m.text}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)]">
        {user ? (
          <>
            {mod.chatMuted ? (
              <p className="text-xs text-[var(--text-muted)] flex-1 py-1">Chat is muted by moderator.</p>
            ) : (
              <>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Say something…"
                  maxLength={200}
                  className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || !connected}
                  className="shrink-0 w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors"
                  aria-label="Send"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            <a href="/login" className="text-[var(--accent)] hover:underline">Sign in</a> to chat
          </p>
        )}
      </div>
    </div>
  );
}
