/**
 * useUserSocket — connects to /user/ws and handles all real-time user events.
 *
 * Events dispatched on window (so any component can subscribe without re-renders):
 *   'millo:notification'  → CustomEvent({ detail: notification })
 *   'millo:dm_message'    → CustomEvent({ detail: message })
 *   'millo:typing'        → CustomEvent({ detail: { fromUserId, isTyping } })
 *   'millo:viewer_count'  → CustomEvent({ detail: { streamId, count } })
 *   'millo:stream_ended'  → CustomEvent({ detail: { streamId } })
 *   'millo:support_new_message'  → CustomEvent({ detail: SupportTicketMessage-ish payload })
 *   'millo:support_message'       → CustomEvent({ detail: { ticketId, message } })
 *
 * Send helpers returned:
 *   sendTyping(toUserId, isTyping)
 *   joinStream(streamId)
 *   leaveStream(streamId)
 *   joinTicket(ticketId)
 *   leaveTicket(ticketId)
 *   sendTicketMessage(ticketId, message, attachments?)
 *
 * https://milloapp.com
 */
import { useEffect, useRef, useCallback } from 'react';
import { getApiBase } from '../config/api.js';

const TOKEN_KEY = 'millo_token';
const WS_BASE   = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase())
  .replace(/^http/, 'ws');

let _socket = null;         // singleton
let _refCount = 0;          // how many components are mounted
const _pendingQueue = [];   // messages queued before socket is open

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function dispatch(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

function connect() {
  const token = getToken();
  if (!token) return;
  if (_socket && (_socket.readyState === WebSocket.CONNECTING || _socket.readyState === WebSocket.OPEN)) return;

  const url = `${WS_BASE}/user/ws?token=${encodeURIComponent(token)}`;
  _socket = new WebSocket(url);

  _socket.addEventListener('open', () => {
    // Flush queued messages
    while (_pendingQueue.length) _socket.send(_pendingQueue.shift());
  });

  _socket.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'ping') {
      _socket.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'notification')  dispatch('millo:notification',  msg.data);
    if (msg.type === 'dm_message')    dispatch('millo:dm_message',    msg.data);
    if (msg.type === 'typing')        dispatch('millo:typing',        msg.data);
    if (msg.type === 'viewer_count')  dispatch('millo:viewer_count',  msg.data);
    if (msg.type === 'stream_ended')  dispatch('millo:stream_ended',  msg.data);
    if (msg.type === 'new_message')  dispatch('millo:support_new_message', msg.data);
    if (msg.type === 'support_message') dispatch('millo:support_message', msg.data);
  });

  _socket.addEventListener('close', () => {
    _socket = null;
    // Reconnect after 3 s if still mounted
    if (_refCount > 0) setTimeout(connect, 3000);
  });

  _socket.addEventListener('error', () => {
    _socket?.close();
  });
}

function sendRaw(payload) {
  const str = JSON.stringify(payload);
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.send(str);
  } else {
    _pendingQueue.push(str);
    connect();
  }
}

export function useUserSocket() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    _refCount++;
    connect();
    return () => {
      _refCount--;
      if (_refCount <= 0) {
        _socket?.close();
        _socket = null;
      }
    };
  }, []);

  const sendTyping  = useCallback((toUserId, isTyping) => sendRaw({ type: 'typing',       data: { toUserId, isTyping } }), []);
  const joinStream  = useCallback((streamId)           => sendRaw({ type: 'join_stream',  data: { streamId } }), []);
  const leaveStream = useCallback((streamId)           => sendRaw({ type: 'leave_stream', data: { streamId } }), []);

  const joinTicket  = useCallback((ticketId) => sendRaw({ type: 'join_ticket',  data: { ticketId } }), []);
  const leaveTicket = useCallback((ticketId) => sendRaw({ type: 'leave_ticket', data: { ticketId } }), []);
  const sendTicketMessage = useCallback((ticketId, message, attachments = []) => {
    return sendRaw({
      type: 'send_message',
      data: { ticketId, message: String(message), attachments },
    });
  }, []);

  return { sendTyping, joinStream, leaveStream, joinTicket, leaveTicket, sendTicketMessage };
}

/** One-off hook that listens to a specific event type and calls handler. */
export function useSocketEvent(eventName, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (ev) => handlerRef.current(ev.detail);
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName]);
}
