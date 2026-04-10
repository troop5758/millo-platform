import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { CookieConsent } from '../components/CookieConsent';
import { MarketingSiteHeader } from '../components/MarketingSiteHeader';
import {
  IconCamera,
  IconShoppingBag,
  IconChevronDown,
  IconEye,
  IconHeart,
  IconLive,
  IconFlash,
} from '../components/Icons';

const GOLD = '#e8c24a';
const BLUE = '#3b82f6';
const RED = '#ef4444';

const IMG = {
  heroProfile: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=280&h=280&fit=crop',
  heroDash: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=520&h=340&fit=crop',
  products: [
    'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&h=520&fit=crop',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=520&fit=crop',
    'https://images.unsplash.com/photo-1564422170194-896b89110ef8?w=400&h=520&fit=crop',
    'https://images.unsplash.com/photo-1590874103328-acbf0a58d959?w=400&h=520&fit=crop',
  ],
  live: [
    'https://images.unsplash.com/photo-1601648767219-2a0e0dbe9923?w=480&h=270&fit=crop',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=480&h=270&fit=crop',
    'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=480&h=270&fit=crop',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=480&h=270&fit=crop',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=480&h=270&fit=crop',
  ],
  creators: [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=640&h=360&fit=crop',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=640&h=360&fit=crop',
  ],
  trendLive: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=520&fit=crop',
  trendStore: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=520&fit=crop',
  trendShorts: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&h=520&fit=crop',
};

const FEATURED = [
  { title: 'Designer Leather Handbag', shop: 'Luxury Fashion', price: '$3.9K', views: '12.4K', likes: '892' },
  { title: 'Cashmere Knit Sweater', shop: 'Atelier Co.', price: '$890', views: '8.1K', likes: '441' },
  { title: 'Urban Runner Sneakers', shop: 'Street Lab', price: '$220', views: '24K', likes: '1.2K' },
  { title: 'Gold Accent Watch', shop: 'Chrono', price: '$1.2K', views: '5.6K', likes: '203' },
  { title: 'Minimal Crossbody', shop: 'Milan Select', price: '$640', views: '9.9K', likes: '512' },
];

const LIVE_CARDS = [
  { name: 'John Doe', tag: 'DJ sets & vinyl digs', viewers: '3.2K' },
  { name: 'Maya Chen', tag: 'Beauty & skincare live', viewers: '1.8K' },
  { name: 'Leo Park', tag: 'Streetwear drops', viewers: '4.5K' },
  { name: 'Sarah Green', tag: 'Home decor hauls', viewers: '920' },
  { name: 'Alex Rivera', tag: 'Gaming & chat', viewers: '6.1K' },
];

const TOP_CREATORS = [
  { name: 'Elena Frost', followers: '1.2K' },
  { name: 'Marcus Lane', followers: '980' },
  { name: 'Priya Das', followers: '2.4K' },
  { name: 'Chris Cole', followers: '1.5K' },
];

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO
        title={t('landing.heroTitle', 'Go Live and Monetize Your Passion')}
        description={t(
          'landing.heroSubtitle',
          'Stream live, sell your products and post shorts — all in one place.'
        )}
        path="/"
      />

      <div className="min-h-screen bg-[#0a0a0c] text-white antialiased selection:bg-amber-500/30">
        <a href="#main-content" className="skip-link">
          {t('a11y.skipToContent', 'Skip to main content')}
        </a>
        <MarketingSiteHeader />

        <main id="main-content" className="outline-none" tabIndex={-1}>
          {/* Hero */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-14 lg:pt-14 lg:pb-20">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-[1.08] tracking-tight text-white">
                  Go Live and Monetize Your Passion
                </h1>
                <p className="mt-5 text-lg text-white/65 max-w-xl leading-relaxed">
                  Stream live, sell your products and post shorts — all in one place.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    to="/go-live"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-600/25 hover:opacity-95 transition-opacity"
                    style={{ backgroundColor: BLUE }}
                  >
                    <IconCamera className="w-5 h-5" />
                    Go Live
                  </Link>
                  <Link
                    to="/seller/onboarding"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-semibold text-[#1a1408] shadow-lg hover:brightness-105 transition-all"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, #f0d875)` }}
                  >
                    <IconShoppingBag className="w-5 h-5" />
                    Open Storefront
                  </Link>
                </div>

                <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Earnings', value: '$2.9K' },
                    { label: 'Live views', value: '1.11K' },
                    { label: 'Shorts', value: '1.1K' },
                    { label: 'Check-ins', value: '205' },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
                    >
                      <p className="text-xs text-white/50 uppercase tracking-wide">{m.label}</p>
                      <p className="mt-1 text-lg font-bold text-white tabular-nums">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative flex justify-center lg:justify-end items-center min-h-[320px] lg:min-h-[400px]">
                <div
                  className="absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full opacity-25 blur-3xl"
                  style={{ background: GOLD }}
                />
                <div className="relative flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                  <div className="relative">
                    <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full overflow-hidden ring-4 ring-white/10 shadow-2xl">
                      <img
                        src={IMG.heroProfile}
                        alt=""
                        className="w-full h-full object-cover"
                        width={208}
                        height={208}
                      />
                    </div>
                    <span
                      className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md text-white shadow"
                      style={{ backgroundColor: RED }}
                    >
                      LIVE
                    </span>
                    <span className="absolute bottom-3 right-3 text-xs font-semibold bg-black/70 text-white px-2.5 py-1 rounded-lg backdrop-blur-sm">
                      205 watching
                    </span>
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#141416] shadow-2xl w-[min(100%,320px)] sm:w-[300px] rotate-1 sm:rotate-2 hover:rotate-0 transition-transform duration-300">
                    <div className="relative aspect-[16/10] bg-[#0d0d0f]">
                      <img
                        src={IMG.heroDash}
                        alt=""
                        className="w-full h-full object-cover opacity-90"
                        width={520}
                        height={340}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                        <div className="flex-1 h-8 rounded-lg bg-white/10 backdrop-blur border border-white/10" />
                        <div className="w-8 h-8 rounded-lg bg-white/15" />
                      </div>
                    </div>
                    <div className="p-3 border-t border-white/10 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white/10" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-24 rounded bg-white/20" />
                        <div className="h-2 w-16 rounded bg-white/10" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Featured Products */}
          <section className="border-t border-white/[0.06] bg-[#080809] py-14 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <h2 className="text-2xl sm:text-3xl font-bold">Featured Products</h2>
              <div className="mt-8 flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin [-ms-overflow-style:none] [scrollbar-width:thin]">
                {FEATURED.map((item, i) => (
                  <article
                    key={item.title}
                    className="snap-start shrink-0 w-[200px] sm:w-[220px] rounded-2xl border border-white/[0.08] bg-[#121214] overflow-hidden group hover:border-white/15 transition-colors"
                  >
                    <div className="relative aspect-[4/5]">
                      <img
                        src={IMG.products[i]}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        width={400}
                        height={520}
                      />
                      <span
                        className="absolute top-3 left-3 text-[10px] font-bold uppercase px-2 py-1 rounded-md text-[#1a1408]"
                        style={{ background: GOLD }}
                      >
                        Product
                      </span>
                      <span className="absolute top-3 right-3 text-xs font-bold bg-black/65 text-white px-2 py-1 rounded-lg backdrop-blur-sm">
                        {item.price}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2">{item.title}</h3>
                      <p className="text-xs text-white/45 mt-1">{item.shop}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
                        <span className="inline-flex items-center gap-1">
                          <IconEye className="w-3.5 h-3.5" />
                          {item.views}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconHeart className="w-3.5 h-3.5" />
                          {item.likes}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Live Now */}
          <section className="py-14 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <h2 className="text-2xl sm:text-3xl font-bold">Live Now</h2>
              <div className="mt-8 flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
                {LIVE_CARDS.map((c, i) => (
                  <article
                    key={c.name}
                    className="snap-start shrink-0 w-[260px] sm:w-[280px] rounded-2xl border border-white/[0.08] bg-[#121214] overflow-hidden"
                  >
                    <div className="relative aspect-video">
                      <img src={IMG.live[i]} alt="" className="w-full h-full object-cover" width={480} height={270} />
                      <span
                        className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded text-white"
                        style={{ backgroundColor: RED }}
                      >
                        LIVE
                      </span>
                      <span className="absolute bottom-2.5 left-2.5 text-xs font-semibold bg-black/70 text-white px-2 py-1 rounded-lg">
                        {c.viewers}
                      </span>
                    </div>
                    <div className="p-3.5 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{c.name}</p>
                        <p className="text-xs text-white/50 line-clamp-2 mt-0.5">{c.tag}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Top Creators */}
          <section className="border-t border-white/[0.06] bg-[#080809] py-14 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-2xl sm:text-3xl font-bold">Top Creators This Week</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10 transition-colors"
                >
                  View Leads Board
                  <IconChevronDown className="w-4 h-4 opacity-70" />
                </button>
              </div>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {TOP_CREATORS.map((c, i) => (
                  <article
                    key={c.name}
                    className="relative rounded-2xl overflow-hidden border border-white/[0.08] aspect-[16/9] group"
                  >
                    <img
                      src={IMG.creators[i]}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      width={640}
                      height={360}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-xs font-bold bg-white/15 backdrop-blur px-2.5 py-1 rounded-lg border border-white/10">
                      {c.followers} followers
                    </span>
                    <p className="absolute bottom-3 right-3 text-sm font-semibold drop-shadow-md">{c.name}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Trending */}
          <section className="py-14 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <h2 className="text-2xl sm:text-3xl font-bold">Trending on Millo</h2>
              <div className="mt-8 grid md:grid-cols-3 gap-6">
                {[
                  {
                    title: 'Live Streaming',
                    blurb: 'HD streams, real-time chat, and instant tips from your community.',
                    icon: <IconLive className="w-7 h-7" />,
                    iconBg: RED,
                    img: IMG.trendLive,
                    creator: 'John Doe',
                    statLabel: 'Followers',
                    stat: '1.2M',
                    earn: '$2,505',
                  },
                  {
                    title: 'Storefront',
                    blurb: 'Showcase products during live shows and close sales without leaving the stream.',
                    icon: <IconShoppingBag className="w-7 h-7" />,
                    iconBg: GOLD,
                    img: IMG.trendStore,
                    creator: 'Sarah Green',
                    verified: true,
                    statLabel: 'Followers',
                    stat: '1.9K',
                    earn: '$1,665',
                  },
                  {
                    title: 'Shorts',
                    blurb: 'Vertical clips that travel fast — built for discovery and replay.',
                    icon: <IconFlash className="w-7 h-7" />,
                    iconBg: BLUE,
                    img: IMG.trendShorts,
                    creator: 'Jessie Rodriguez',
                    statLabel: 'Followers',
                    stat: '4.8K',
                    earn: '$1,475',
                  },
                ].map((col) => (
                  <article
                    key={col.title}
                    className="rounded-2xl border border-white/[0.08] bg-[#121214] overflow-hidden flex flex-col"
                  >
                    <div className="p-6 pb-4">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4"
                        style={{ backgroundColor: col.iconBg }}
                      >
                        {col.icon}
                      </div>
                      <h3 className="text-xl font-bold">{col.title}</h3>
                      <p className="mt-2 text-sm text-white/55 leading-relaxed">{col.blurb}</p>
                    </div>
                    <div className="relative flex-1 min-h-[200px] mt-auto">
                      <img src={col.img} alt="" className="absolute inset-0 w-full h-full object-cover" width={400} height={520} />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/40 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{col.creator}</p>
                          {col.verified && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-[#1a1408]" style={{ background: GOLD }}>
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                          <span>
                            {col.statLabel}: <span className="text-white/90 font-medium">{col.stat}</span>
                          </span>
                          <span>
                            Earnings:{' '}
                            <span className="text-emerald-400/90 font-semibold tabular-nums">{col.earn}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="border-t border-white/[0.06] bg-gradient-to-b from-[#0a0a0c] to-[#12100c] py-20 sm:py-24">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold">Start Creating Today</h2>
              <p className="mt-4 text-lg text-white/55">
                Join thousands of creators already earning on Millo.
              </p>
              <Link
                to="/signup"
                className="mt-10 inline-flex items-center justify-center rounded-2xl px-10 py-4 text-lg font-bold text-[#1a1408] shadow-xl hover:brightness-105 transition-all"
                style={{ background: `linear-gradient(135deg, ${GOLD}, #f0d875)` }}
              >
                Create Account
              </Link>
            </div>
          </section>

          <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-white/35">
            <p>© {new Date().getFullYear()} Millo · https://milloapp.com</p>
          </footer>
        </main>

        <CookieConsent />
      </div>
    </>
  );
}
