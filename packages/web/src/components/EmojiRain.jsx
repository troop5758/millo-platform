/**
 * EmojiRain — TikTok-style floating emoji burst.
 * When server sends reaction_burst { emoji, count }, renders emoji rain overlay.
 * https://milloapp.com
 */
import React, { useState, useRef, useEffect } from 'react';

const MAX_VISIBLE = 50;
const DURATION_MS = 2500;

export function EmojiRain({ bursts, className = '' }) {
  const [items, setItems] = useState([]);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!bursts || bursts.length === 0) return;
    const latest = bursts[bursts.length - 1];
    const { emoji, count } = latest;
    const n = Math.min(Math.max(1, Math.round(count)), MAX_VISIBLE);
    const newItems = Array.from({ length: n }, () => ({
      key: keyRef.current++,
      emoji,
      left: 5 + Math.random() * 90,
      delay: Math.random() * 400,
      size: 14 + Math.random() * 18,
    }));
    setItems((prev) => [...prev, ...newItems].slice(-MAX_VISIBLE * 2));
    const t = setTimeout(() => {
      setItems((prev) => prev.filter((x) => !newItems.some((n) => n.key === x.key)));
    }, DURATION_MS + 500);
    return () => clearTimeout(t);
  }, [bursts]);

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-10 ${className}`}>
      {items.map((item) => (
        <div
          key={item.key}
          className="emoji-rain-item absolute bottom-0"
          style={{
            left: `${item.left}%`,
            fontSize: `${item.size}px`,
            animationDelay: `${item.delay}ms`,
          }}
        >
          {item.emoji}
        </div>
      ))}
    </div>
  );
}
