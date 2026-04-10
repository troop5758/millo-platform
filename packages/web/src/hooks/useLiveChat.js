/**
 * useLiveChat — TikTok-style realtime chat hook.
 *
 * Compatibility with the Phase-3 snippet intent, but this repo uses native
 * WebSockets (not socket.io). We connect to:
 *   ws: /live/ws?streamId=<id>&token=<token?>
 *
 * Returns:
 *   messages[] — array of { id, displayName, text, ts }
 */
import { useEffect, useRef, useState } from 'react';
import { fetchStreamChat } from '../sdk/contentApi';
import { getToken } from '../sdk/authApi';
import { getApiBase } from '../config/api.js';

const WS_BASE = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase())
  .replace(/^http/, 'ws');

export default function useLiveChat(streamId) {
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!streamId) return;

    let alive = true;
    const token = getToken?.() || '';

    setMessages([]);

    // Load history first (best effort).
    fetchStreamChat(streamId)
      .then((list) => {
        if (!alive) return;
        const mapped = (Array.isArray(list) ? list : []).map((m) => ({
          id: m.messageId || m._id || String(m.ts || m.createdAt || Date.now()),
          displayName: m.displayName || m.user?.displayName || m.username || 'Viewer',
          text: m.text || m.message || '',
          ts: m.ts ?? m.createdAt ?? Date.now(),
        }));
        setMessages(mapped.slice(-200));
      })
      .catch(() => {});

    const url = `${WS_BASE}/live/ws?streamId=${encodeURIComponent(streamId)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!alive) return;

      if (msg.type === 'chat' || msg.type === 'new_message') {
        const next = {
          id: msg.messageId || msg.id || Date.now() + Math.random(),
          displayName: msg.displayName || msg.user?.displayName || 'Viewer',
          text: msg.text || msg.message || '',
          ts: msg.ts ?? msg.timestamp ?? Date.now(),
        };
        setMessages((prev) => [...prev.slice(-199), next]);
      }
    });

    return () => {
      alive = false;
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [streamId]);

  return messages;
}

