/**
 * GiftPanel — TikTok-quality virtual gifts with AI-generated SVG artwork.
 * Each gift is a multi-layer SVG with gradients, glows, and CSS animations.
 * Clicking a gift fires a floating animation and triggers onSend callback.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { IconX } from './Icons';
import { usePricing } from '../sdk/pricingApi';
import { sendGift, fetchWallet } from '../sdk/contentApi';
import { getDeviceFingerprint } from '../lib/deviceFingerprint';

/* ── Gift definitions ── */
export const GIFTS = [
  {
    id: 'rose',
    name: 'Rose',
    coins: 1,
    tier: 'common',
    color: '#e53e3e',
    Svg: RoseSvg,
  },
  {
    id: 'ice-cream',
    name: 'Ice Cream',
    coins: 5,
    tier: 'common',
    color: '#f97316',
    Svg: IceCreamSvg,
  },
  {
    id: 'lollipop',
    name: 'Lollipop',
    coins: 10,
    tier: 'common',
    color: '#a855f7',
    Svg: LollipopSvg,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    coins: 50,
    tier: 'rare',
    color: '#38bdf8',
    Svg: DiamondSvg,
  },
  {
    id: 'trophy',
    name: 'Trophy',
    coins: 99,
    tier: 'rare',
    color: '#eab308',
    Svg: TrophySvg,
  },
  {
    id: 'crown',
    name: 'Crown',
    coins: 199,
    tier: 'rare',
    color: '#f59e0b',
    Svg: CrownSvg,
  },
  {
    id: 'rocket',
    name: 'Rocket',
    coins: 299,
    tier: 'epic',
    color: '#6366f1',
    Svg: RocketSvg,
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    coins: 499,
    tier: 'epic',
    color: '#8b5cf6',
    Svg: GalaxySvg,
  },
  {
    id: 'dragon',
    name: 'Dragon',
    coins: 999,
    tier: 'epic',
    color: '#10b981',
    Svg: DragonSvg,
  },
  {
    id: 'lion',
    name: 'Lion',
    coins: 1499,
    tier: 'legendary',
    color: '#f59e0b',
    Svg: LionSvg,
  },
  {
    id: 'universe',
    name: 'Universe',
    coins: 4999,
    tier: 'legendary',
    color: '#a78bfa',
    Svg: UniverseSvg,
  },
  {
    id: 'millo-star',
    name: 'Millo Star',
    coins: 9999,
    tier: 'legendary',
    color: '#fb923c',
    Svg: MilloStarSvg,
  },
];

const TIERS = {
  common:    { label: 'Common',    bg: 'bg-[var(--bg-card)]',   ring: 'ring-[var(--border-strong)]',  text: 'text-[var(--text-secondary)]' },
  rare:      { label: 'Rare',      bg: 'bg-blue-900/60',    ring: 'ring-blue-500',   text: 'text-blue-300' },
  epic:      { label: 'Epic',      bg: 'bg-purple-900/60',  ring: 'ring-purple-500', text: 'text-purple-300' },
  legendary: { label: 'Legendary', bg: 'bg-amber-900/60',   ring: 'ring-amber-400',  text: 'text-amber-300' },
};

/** TikTok-style animation priority: common/rare → small overlay; epic → large; legendary → full-screen */
export const GIFT_ANIMATION_PRIORITY = {
  small:      { size: 'w-10 h-10', duration: 2000, class: 'gift-priority-small' },
  large:      { size: 'w-24 h-24', duration: 3500, class: 'gift-priority-large' },
  fullscreen: { size: 'w-48 h-48', duration: 5000, class: 'gift-priority-fullscreen' },
};

/** Map tier to animation priority */
export function getAnimationPriority(tier) {
  if (tier === 'legendary') return 'fullscreen';
  if (tier === 'epic') return 'large';
  return 'small';
}

const FILTERS = ['All', 'Common', 'Rare', 'Epic', 'Legendary'];

/* ── Main panel ── */
export function GiftPanel({ onClose, onSend, receiverId = null, streamId = null, sendGiftViaWs = null, giftsBlocked = false }) {
  const [filter,   setFilter]   = useState('All');
  const [selected, setSelected] = useState(null);
  const [sending,  setSending]  = useState(false);
  const [balance,  setBalance]  = useState(null);
  const [error,    setError]    = useState(null);
  const { config } = usePricing();

  // Fetch real wallet balance
  useEffect(() => {
    fetchWallet()
      .then((w) => setBalance(w?.balanceCents ?? 0))
      .catch(() => setBalance(0));
  }, []);

  // Merge DB-backed prices into the GIFTS metadata (fallback to hardcoded default)
  const giftsWithPricing = GIFTS.map((g) => ({
    ...g,
    coins: config.giftCosts?.[g.id] ?? g.coins,
  }));

  const visible = filter === 'All'
    ? giftsWithPricing
    : giftsWithPricing.filter((g) => g.tier === filter.toLowerCase());

  const userCoins = balance ?? 0;

  const handleSend = useCallback(async () => {
    if (!selected || sending || giftsBlocked) return;
    setSending(true);
    setError(null);
    try {
      if (receiverId) {
        const fingerprint = await getDeviceFingerprint();
        const useWs = sendGiftViaWs && streamId;
        if (useWs) {
          const ok = sendGiftViaWs(selected.id, selected.coins, fingerprint || undefined);
          if (ok) {
            fetchWallet().then((w) => setBalance(w?.balanceCents ?? 0)).catch(() => {});
            onSend?.(selected);
          } else {
            setError('Connection lost. Please try again.');
          }
        } else {
          const res = await sendGift(receiverId, selected.id, selected.coins, streamId, fingerprint || undefined);
          if (res?.newBalance !== undefined) setBalance(res.newBalance);
          onSend?.(selected);
        }
      }
    } catch (e) {
      const msg = e?.message?.includes('402') ? 'Not enough coins' : 'Failed to send gift';
      setError(msg);
    } finally {
      setTimeout(() => { setSending(false); setSelected(null); setError(null); }, 800);
    }
  }, [selected, sending, onSend, receiverId, streamId, sendGiftViaWs, giftsBlocked]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-elevated)] rounded-t-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <p className="font-semibold text-[var(--text)] text-sm">Send a Gift</p>
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
            <CoinIcon className="w-3 h-3 text-[var(--accent-premium)]" />
            {userCoins.toLocaleString()} coins
          </p>
        </div>
        <button type="button" onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
          <IconX className="w-4 h-4" />
        </button>
      </div>

      {/* Tier filter */}
      <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-[var(--border)]">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' +
              (filter === f
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')}>
            {f}
          </button>
        ))}
      </div>

      {/* Gift grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-4 gap-2.5">
          {visible.map((gift) => {
            const tier = TIERS[gift.tier];
            const isSelected = selected?.id === gift.id;
            return (
              <button key={gift.id} type="button" onClick={() => setSelected(isSelected ? null : gift)}
                className={'relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all ' +
                  tier.bg + ' ' +
                  (isSelected ? 'ring-2 ' + tier.ring + ' scale-105 shadow-lg' : 'hover:scale-102 hover:brightness-110')}>
                {/* Legendary shimmer overlay */}
                {gift.tier === 'legendary' && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <div className="gift-shimmer absolute inset-0 rounded-xl" />
                  </div>
                )}
                {/* SVG artwork */}
                <div className="w-14 h-14 flex items-center justify-center relative">
                  {isSelected && (
                    <span className="absolute inset-0 rounded-full animate-ping"
                      style={{ backgroundColor: gift.color + '30' }} />
                  )}
                  <gift.Svg className="w-12 h-12 drop-shadow-lg" />
                </div>
                <span className="text-xs font-semibold text-[var(--text)] truncate w-full text-center leading-tight">
                  {gift.name}
                </span>
                <span className={'flex items-center gap-0.5 text-xs font-bold ' + tier.text}>
                  <CoinIcon className="w-3 h-3" />
                  {gift.coins >= 1000 ? (gift.coins / 1000).toFixed(gift.coins % 1000 ? 1 : 0) + 'K' : gift.coins}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Send bar */}
      <div className="px-4 py-3 border-t border-[var(--border)]">
        {giftsBlocked && (
          <p className="text-xs text-[var(--accent-warning)] text-center mb-2">Gifts disabled by moderator</p>
        )}
        {error && (
          <p className="text-xs text-red-500 text-center mb-2">{error}</p>
        )}
        {selected ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: selected.color + '22' }}>
              <selected.Svg className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">{selected.name}</p>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <CoinIcon className="w-3 h-3 text-[var(--accent-premium)]" />
                {selected.coins.toLocaleString()} coins
                {userCoins < selected.coins && (
                  <span className="text-red-400 ml-1">(insufficient)</span>
                )}
              </p>
            </div>
            <button type="button" onClick={handleSend}
              disabled={sending || userCoins < selected.coins || giftsBlocked}
              className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: selected.color }}>
              {sending ? 'Sent!' : 'Send'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)] text-center py-1">Select a gift to send</p>
        )}
      </div>
    </div>
  );
}

/* ── Floating gift animation overlay (TikTok-style: small / large / fullscreen by tier) ── */
export function GiftFloaters({ floaters }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {floaters.map((g) => {
        const priority = g.priority || (g.gift ? getAnimationPriority(g.gift.tier) : 'small');
        const isFullscreen = priority === 'fullscreen';
        const Svg = g.Svg;
        if (!Svg) return null;
        return (
          <div
            key={g.key}
            className={`gift-float gift-priority-${priority} gift-bounce-in absolute flex flex-col items-center justify-center ${
              isFullscreen ? 'inset-0' : 'bottom-20'
            }`}
            style={isFullscreen ? {} : { left: `${g.left}%` }}
          >
            <Svg className="gift-icon drop-shadow-2xl" />
          </div>
        );
      })}
    </div>
  );
}

/* ── Legacy: simple gift animation (no priority) ── */
export function GiftAnimation({ gifts }) {
  const floaters = (gifts || []).map((g) => ({
    key: g.key,
    left: g.left ?? 50,
    Svg: g.Svg,
    gift: g.gift || g,
    priority: g.gift ? getAnimationPriority(g.gift.tier) : 'small',
  }));
  return <GiftFloaters floaters={floaters} />;
}

/* ── Coin icon ── */
function CoinIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="10" fill="#fbbf24" />
      <circle cx="12" cy="12" r="8" fill="#f59e0b" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#78350f">M</text>
    </svg>
  );
}

/* ══════════════════════════════════════
   SVG Gift Artwork — AI-style, multi-layer
   ══════════════════════════════════════ */

function RoseSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rg1" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="100%" stopColor="#e11d48" />
        </radialGradient>
        <radialGradient id="rg2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fecdd3" />
          <stop offset="100%" stopColor="#f43f5e" />
        </radialGradient>
      </defs>
      {/* Stem */}
      <path d="M32 52 Q28 44 30 36" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Leaf */}
      <path d="M30 42 Q24 38 26 32 Q30 36 30 42z" fill="#22c55e" />
      {/* Petals outer */}
      <ellipse cx="32" cy="28" rx="12" ry="9" fill="url(#rg1)" transform="rotate(-15,32,28)" />
      <ellipse cx="32" cy="28" rx="12" ry="9" fill="url(#rg1)" transform="rotate(30,32,28)" opacity="0.85" />
      <ellipse cx="32" cy="28" rx="12" ry="9" fill="url(#rg1)" transform="rotate(75,32,28)" opacity="0.85" />
      {/* Petals inner */}
      <ellipse cx="32" cy="28" rx="8" ry="6" fill="url(#rg2)" transform="rotate(0,32,28)" />
      <ellipse cx="32" cy="28" rx="8" ry="6" fill="url(#rg2)" transform="rotate(45,32,28)" opacity="0.9" />
      {/* Center */}
      <circle cx="32" cy="27" r="4" fill="#9f1239" />
      <circle cx="31" cy="26" r="1.5" fill="#fda4af" opacity="0.6" />
    </svg>
  );
}

function IceCreamSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ic1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#c2410c" />
        </linearGradient>
        <radialGradient id="ic2" cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#fbcfe8" />
          <stop offset="100%" stopColor="#ec4899" />
        </radialGradient>
      </defs>
      {/* Cone */}
      <polygon points="32,54 18,32 46,32" fill="url(#ic1)" />
      <line x1="25" y1="35" x2="32" y2="54" stroke="#9a3412" strokeWidth="1" opacity="0.4" />
      <line x1="32" y1="32" x2="38" y2="50" stroke="#9a3412" strokeWidth="1" opacity="0.4" />
      {/* Scoop 1 */}
      <circle cx="32" cy="28" r="12" fill="url(#ic2)" />
      {/* Scoop 2 */}
      <circle cx="24" cy="22" r="9" fill="#a7f3d0" />
      <circle cx="40" cy="22" r="9" fill="#bfdbfe" />
      {/* Highlights */}
      <circle cx="28" cy="18" r="3" fill="white" opacity="0.4" />
      <circle cx="38" cy="18" r="2" fill="white" opacity="0.4" />
      {/* Sprinkles */}
      <rect x="28" y="24" width="4" height="1.5" rx="1" fill="#e11d48" transform="rotate(30,30,25)" />
      <rect x="34" y="26" width="4" height="1.5" rx="1" fill="#2563eb" transform="rotate(-20,36,27)" />
      <rect x="30" y="30" width="3" height="1.5" rx="1" fill="#eab308" transform="rotate(10,31,31)" />
      {/* Cherry */}
      <circle cx="32" cy="14" r="3" fill="#e11d48" />
      <path d="M32 14 Q34 10 36 12" stroke="#166534" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function LollipopSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="lp1" cx="38%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6b21a8" />
        </radialGradient>
      </defs>
      <line x1="38" y1="38" x2="50" y2="56" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="26" r="18" fill="url(#lp1)" />
      <path d="M14 20 Q20 10 30 14 Q38 18 34 28 Q30 38 20 36 Q10 32 14 20z" fill="white" opacity="0.15" />
      {/* Swirl */}
      <path d="M26 18 Q32 20 30 26 Q28 32 22 30 Q16 28 18 22 Q20 16 26 18z" fill="none" stroke="white" strokeWidth="2" opacity="0.5" />
      <circle cx="22" cy="20" r="2" fill="white" opacity="0.4" />
    </svg>
  );
}

function DiamondSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="d1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="d2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      {/* Main gem */}
      <polygon points="32,8 50,22 44,52 20,52 14,22" fill="url(#d1)" />
      {/* Facets */}
      <polygon points="32,8 50,22 32,26" fill="url(#d2)" opacity="0.7" />
      <polygon points="32,8 14,22 32,26" fill="#bae6fd" opacity="0.5" />
      <polygon points="14,22 20,52 32,26" fill="#0369a1" opacity="0.4" />
      <polygon points="50,22 44,52 32,26" fill="#0284c7" opacity="0.5" />
      <polygon points="20,52 44,52 32,26" fill="#0ea5e9" opacity="0.6" />
      {/* Sparkles */}
      <circle cx="52" cy="14" r="2" fill="#e0f2fe" />
      <path d="M52 10 L52 18 M48 14 L56 14" stroke="#7dd3fc" strokeWidth="1.5" />
      <circle cx="14" cy="36" r="1.5" fill="#bae6fd" />
      {/* Highlight */}
      <ellipse cx="26" cy="20" rx="5" ry="3" fill="white" opacity="0.4" transform="rotate(-20,26,20)" />
    </svg>
  );
}

function TrophySvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tr1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* Base */}
      <rect x="22" y="50" width="20" height="5" rx="2" fill="url(#tr1)" />
      <rect x="26" y="44" width="12" height="8" rx="1" fill="#d97706" />
      {/* Cup */}
      <path d="M18 12 L18 36 Q18 46 32 46 Q46 46 46 36 L46 12 Z" fill="url(#tr1)" />
      {/* Handles */}
      <path d="M18 18 Q10 18 10 26 Q10 34 18 32" fill="none" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 18 Q54 18 54 26 Q54 34 46 32" fill="none" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
      {/* Star on cup */}
      <polygon points="32,20 34,26 40,26 35,30 37,36 32,32 27,36 29,30 24,26 30,26" fill="#fef3c7" opacity="0.9" />
      {/* Shine */}
      <ellipse cx="25" cy="20" rx="3" ry="5" fill="white" opacity="0.2" transform="rotate(-15,25,20)" />
    </svg>
  );
}

function CrownSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cr1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {/* Crown body */}
      <path d="M8 42 L14 20 L24 34 L32 12 L40 34 L50 20 L56 42 Z" fill="url(#cr1)" />
      <rect x="8" y="42" width="48" height="8" rx="3" fill="#b45309" />
      {/* Gems */}
      <circle cx="32" cy="42" r="4" fill="#e11d48" />
      <circle cx="18" cy="42" r="3" fill="#2563eb" />
      <circle cx="46" cy="42" r="3" fill="#16a34a" />
      {/* Points gems */}
      <circle cx="32" cy="14" r="3" fill="#e11d48" />
      <circle cx="14" cy="22" r="2.5" fill="#a855f7" />
      <circle cx="50" cy="22" r="2.5" fill="#a855f7" />
      {/* Highlight */}
      <path d="M16 26 Q20 22 24 26" stroke="white" strokeWidth="2" fill="none" opacity="0.4" />
    </svg>
  );
}

function RocketSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rkt1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="rkt2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {/* Flame */}
      <ellipse cx="32" cy="54" rx="6" ry="8" fill="url(#rkt2)" opacity="0.9" />
      <ellipse cx="32" cy="52" rx="3" ry="5" fill="#fde68a" opacity="0.8" />
      {/* Body */}
      <path d="M22 44 Q22 18 32 10 Q42 18 42 44 Z" fill="url(#rkt1)" />
      {/* Nose */}
      <path d="M24 28 Q24 10 32 6 Q40 10 40 28" fill="#818cf8" />
      {/* Wings */}
      <path d="M22 44 L14 52 L22 48" fill="#4f46e5" />
      <path d="M42 44 L50 52 L42 48" fill="#4f46e5" />
      {/* Window */}
      <circle cx="32" cy="30" r="6" fill="#e0f2fe" stroke="#4f46e5" strokeWidth="1.5" />
      <circle cx="32" cy="30" r="4" fill="#38bdf8" />
      <circle cx="30" cy="28" r="1.5" fill="white" opacity="0.6" />
      {/* Stars */}
      <circle cx="50" cy="16" r="1.5" fill="white" />
      <circle cx="14" cy="22" r="1" fill="white" />
      <circle cx="54" cy="28" r="1" fill="#c7d2fe" />
    </svg>
  );
}

function GalaxySvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="gx1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="40%" stopColor="#a855f7" />
          <stop offset="80%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#gx1)" />
      {/* Spiral arms */}
      <path d="M32 32 Q42 22 52 24 Q54 32 48 38 Q38 44 32 32z" fill="#c084fc" opacity="0.4" />
      <path d="M32 32 Q22 42 12 40 Q10 32 16 26 Q26 20 32 32z" fill="#c084fc" opacity="0.4" />
      {/* Stars */}
      {[[16,14],[44,12],[54,36],[42,52],[18,50],[8,28]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r={1+i%2} fill="white" opacity={0.6+i*0.06} />
      ))}
      <circle cx="32" cy="32" r="5" fill="#fde68a" opacity="0.9" />
      <circle cx="32" cy="32" r="3" fill="white" />
      {/* Glow ring */}
      <circle cx="32" cy="32" r="18" fill="none" stroke="#e879f9" strokeWidth="1" opacity="0.3" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#a855f7" strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
}

function DragonSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dr1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="dr2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Body */}
      <ellipse cx="32" cy="38" rx="18" ry="14" fill="url(#dr1)" />
      {/* Neck */}
      <ellipse cx="28" cy="24" rx="8" ry="10" fill="#10b981" />
      {/* Head */}
      <ellipse cx="24" cy="16" rx="12" ry="9" fill="url(#dr1)" />
      {/* Snout */}
      <ellipse cx="16" cy="18" rx="6" ry="4" fill="#34d399" />
      {/* Nostril fire */}
      <ellipse cx="12" cy="18" rx="3" ry="2" fill="#fbbf24" opacity="0.9" />
      <ellipse cx="12" cy="18" rx="1.5" ry="1" fill="#f97316" />
      {/* Eye */}
      <circle cx="22" cy="13" r="3" fill="#fde68a" />
      <circle cx="22" cy="13" r="1.5" fill="#78350f" />
      <circle cx="21" cy="12" r="0.7" fill="white" />
      {/* Horn */}
      <path d="M28 8 Q24 4 26 10" fill="#f59e0b" />
      <path d="M20 10 Q16 6 19 12" fill="#f59e0b" />
      {/* Wings */}
      <path d="M44 28 Q58 18 56 36 Q48 38 44 32" fill="#6ee7b7" opacity="0.8" />
      <path d="M44 28 Q52 22 54 30 Q48 34 44 32" fill="#a7f3d0" opacity="0.5" />
      {/* Tail */}
      <path d="M48 42 Q56 48 52 54 Q46 52 48 46" fill="#10b981" />
      {/* Scales */}
      <circle cx="32" cy="36" r="2" fill="#34d399" opacity="0.5" />
      <circle cx="38" cy="40" r="2" fill="#34d399" opacity="0.5" />
      <circle cx="26" cy="40" r="2" fill="#34d399" opacity="0.5" />
    </svg>
  );
}

function LionSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ln1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="60%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="ln2" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fbbf24" />
        </radialGradient>
      </defs>
      {/* Mane */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((a, i) => (
        <ellipse key={i} cx={32+15*Math.cos(a*Math.PI/180)} cy={30+15*Math.sin(a*Math.PI/180)}
          rx="5" ry="7" fill="#b45309" opacity="0.7"
          transform={`rotate(${a},${32+15*Math.cos(a*Math.PI/180)},${30+15*Math.sin(a*Math.PI/180)})`} />
      ))}
      {/* Face */}
      <circle cx="32" cy="30" r="16" fill="url(#ln2)" />
      {/* Ears */}
      <polygon points="16,18 10,8 22,14" fill="#f59e0b" />
      <polygon points="48,18 54,8 42,14" fill="#f59e0b" />
      <polygon points="17,17 13,10 21,14" fill="#fde68a" />
      <polygon points="47,17 51,10 43,14" fill="#fde68a" />
      {/* Eyes */}
      <circle cx="26" cy="27" r="4" fill="#fef3c7" />
      <circle cx="38" cy="27" r="4" fill="#fef3c7" />
      <circle cx="26" cy="27" r="2.5" fill="#78350f" />
      <circle cx="38" cy="27" r="2.5" fill="#78350f" />
      <circle cx="25" cy="26" r="1" fill="white" />
      <circle cx="37" cy="26" r="1" fill="white" />
      {/* Nose + mouth */}
      <ellipse cx="32" cy="33" rx="4" ry="2.5" fill="#b45309" />
      <circle cx="30" cy="32" r="1.2" fill="#7c2d12" />
      <circle cx="34" cy="32" r="1.2" fill="#7c2d12" />
      <path d="M28 36 Q32 39 36 36" fill="none" stroke="#7c2d12" strokeWidth="1.5" strokeLinecap="round" />
      {/* Whiskers */}
      <line x1="14" y1="32" x2="26" y2="33" stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
      <line x1="14" y1="35" x2="26" y2="35" stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
      <line x1="38" y1="33" x2="50" y2="32" stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
      <line x1="38" y1="35" x2="50" y2="35" stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

function UniverseSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="un1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="50%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </radialGradient>
        <radialGradient id="un2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      {/* Dark space bg */}
      <circle cx="32" cy="32" r="30" fill="url(#un1)" />
      {/* Orbit ring 1 */}
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="#a5b4fc" strokeWidth="1.5" opacity="0.5" transform="rotate(-20,32,32)" />
      {/* Orbit ring 2 */}
      <ellipse cx="32" cy="32" rx="22" ry="8" fill="none" stroke="#c084fc" strokeWidth="1" opacity="0.4" transform="rotate(40,32,32)" />
      {/* Sun / star */}
      <circle cx="32" cy="32" r="9" fill="url(#un2)" />
      <circle cx="32" cy="32" r="6" fill="#fef3c7" />
      {/* Planets */}
      <circle cx="54" cy="28" r="5" fill="#f97316" />
      <circle cx="54" cy="28" r="3" fill="#fed7aa" />
      <ellipse cx="54" cy="28" rx="8" ry="2" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.5" />
      <circle cx="14" cy="38" r="3.5" fill="#6ee7b7" />
      <circle cx="44" cy="52" r="2.5" fill="#818cf8" />
      {/* Stars */}
      {[[8,10],[56,14],[10,54],[58,50],[32,6],[48,8]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r={1+i%2*0.5} fill="white" opacity={0.5+i*0.08} />
      ))}
      {/* Shine on sun */}
      <circle cx="29" cy="29" r="2" fill="white" opacity="0.4" />
    </svg>
  );
}

function MilloStarSvg({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ms1" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id="ms2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#fbbf24" />
        </radialGradient>
      </defs>
      {/* Glow */}
      <circle cx="32" cy="32" r="30" fill="#f97316" opacity="0.12" />
      <circle cx="32" cy="32" r="24" fill="#f97316" opacity="0.1" />
      {/* Star */}
      <polygon points="32,6 38,22 56,22 42,34 47,50 32,40 17,50 22,34 8,22 26,22"
        fill="url(#ms1)" stroke="#b45309" strokeWidth="0.5" />
      {/* Inner shine */}
      <polygon points="32,12 36,22 46,22 38,28 41,40 32,34 23,40 26,28 18,22 28,22"
        fill="url(#ms2)" opacity="0.7" />
      {/* M letter */}
      <text x="32" y="35" textAnchor="middle" fontSize="12" fontWeight="900" fill="#7c2d12" fontFamily="Inter,sans-serif">M</text>
      {/* Sparkles */}
      <path d="M52 10 L53 14 L57 13 L53 16 L54 20 L51 17 L47 19 L49 15 L46 12 L50 13z" fill="#fde68a" />
      <path d="M10 44 L11 47 L14 46 L11 48 L12 51 L10 49 L7 50 L8 47 L6 45 L9 46z" fill="#fed7aa" />
    </svg>
  );
}
