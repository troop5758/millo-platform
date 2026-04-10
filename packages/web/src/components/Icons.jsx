/**
 * Millo icon library — clean SVG icons, consistent stroke style (Heroicons outline variant).
 * All icons: 24x24 viewBox, stroke="currentColor", fill="none", strokeWidth={1.75}.
 * Usage: <IconHome className="w-5 h-5" />
 */

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ d, children, className = 'w-5 h-5', ...rest }) => (
  <svg viewBox="0 0 24 24" className={className} {...base} {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const IconHome = (p) => <Icon {...p}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></Icon>;
export const IconLive = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14M16.24 7.76a6 6 0 010 8.49M7.76 7.76a6 6 0 000 8.49" /></Icon>;
export const IconPlay = (p) => <Icon {...p} d="M5 3l14 9-14 9V3z" />;
export const IconPlayCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M10 8l6 4-6 4V8z" /></Icon>;
export const IconSearch = (p) => <Icon {...p} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />;
export const IconBell = (p) => <Icon {...p}><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V4a1 1 0 10-2 0v1.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></Icon>;
export const IconUser = (p) => <Icon {...p}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></Icon>;
export const IconUsers = (p) => <Icon {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></Icon>;
export const IconUserPlus = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M20 8v6M23 11h-6M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></Icon>;
export const IconMail = (p) => <Icon {...p}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></Icon>;
export const IconMenu = (p) => <Icon {...p} d="M4 6h16M4 12h16M4 18h16" />;
export const IconSettings = (p) => <Icon {...p}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const IconChevronLeft = (p) => <Icon {...p} d="M15 19l-7-7 7-7" />;
export const IconChevronRight = (p) => <Icon {...p} d="M9 5l7 7-7 7" />;
export const IconChevronDown = (p) => <Icon {...p} d="M19 9l-7 7-7-7" />;
export const IconArrowLeft = (p) => <Icon {...p} d="M19 12H5M12 5l-7 7 7 7" />;
export const IconArrowRight = (p) => <Icon {...p} d="M5 12h14M12 5l7 7-7 7" />;
export const IconHeart = (p) => <Icon {...p} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />;
export const IconHeartSolid = (p) => <Icon {...p} fill="currentColor" strokeWidth={0} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />;
export const IconEye = (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const IconVideo = (p) => <Icon {...p} d="M15 10l4.553-2.069A1 1 0 0121 8.862v6.276a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />;
export const IconCamera = (p) => <Icon {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></Icon>;
export const IconMic = (p) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" /></Icon>;
export const IconStar = (p) => <Icon {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
export const IconStarSolid = (p) => <Icon {...p} fill="currentColor" strokeWidth={0} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />;
export const IconTrophy = (p) => <Icon {...p}><path d="M8 21h8M12 17v4M7 4H4a2 2 0 00-2 2v2c0 3.31 2.69 6 6 6M17 4h3a2 2 0 012 2v2c0 3.31-2.69 6-6 6M7 10c0 2.76 2.24 5 5 5s5-2.24 5-5V4H7v6z" /></Icon>;
export const IconHash = (p) => <Icon {...p} d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />;
export const IconGlobe = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" /></Icon>;
export const IconSun = (p) => <Icon {...p}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></Icon>;
export const IconMoon = (p) => <Icon {...p} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />;
export const IconShoppingBag = (p) => <Icon {...p}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" /></Icon>;
export const IconShoppingCart = (p) => <Icon {...p}><path d="M6 2H3l-1-1M6 2l1.5 7.5M6 2h15l-2 9H7.5M20 21a1 1 0 100-2 1 1 0 000 2zM9 21a1 1 0 100-2 1 1 0 000 2z" /></Icon>;
export const IconPackage = (p) => <Icon {...p}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Icon>;
export const IconTag = (p) => <Icon {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" /></Icon>;
export const IconGavel = (p) => <Icon {...p}><path d="M14.5 2.5l7 7M7 20l-5 2 2-5 10-10-4-4L7 20z" /></Icon>;
export const IconCoin = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 3" /></Icon>;
export const IconTrendingUp = (p) => <Icon {...p} d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" />;
export const IconGamepad = (p) => <Icon {...p}><rect x="2" y="6" width="20" height="12" rx="4" /><path d="M7 12h4M9 10v4M15 12h.01M17 10h.01" /></Icon>;
export const IconBrush = (p) => <Icon {...p}><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.07" /><path d="M7.07 14.94C5.79 16.22 4 17 2 17c1 0 2.5.5 3 2 .5 1.5 2 2 3 1.5.5-.3 1-1 1-1.5v-1.5c0-.83.67-1.5 1.5-1.5h.56l.94-.94-4-4z" /></Icon>;
export const IconUtensils = (p) => <Icon {...p}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" /></Icon>;
export const IconSmile = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Icon>;
export const IconLock = (p) => <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></Icon>;
export const IconShield = (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
export const IconTruck = (p) => <Icon {...p}><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></Icon>;
export const IconBookmark = (p) => <Icon {...p} d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />;
export const IconShare = (p) => <Icon {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" /></Icon>;
export const IconEdit = (p) => <Icon {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>;
export const IconMore = (p) => <Icon {...p}><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></Icon>;
export const IconMoreHoriz = (p) => <Icon {...p}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></Icon>;
export const IconX = (p) => <Icon {...p} d="M18 6L6 18M6 6l12 12" />;
export const IconCheck = (p) => <Icon {...p} d="M20 6L9 17l-5-5" />;
export const IconCheckCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" /></Icon>;
export const IconAlertCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icon>;
export const IconPieChart = (p) => <Icon {...p}><path d="M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z" /></Icon>;
export const IconBarChart = (p) => <Icon {...p}><path d="M18 20V10M12 20V4M6 20v-6" /></Icon>;
export const IconDollar = (p) => <Icon {...p}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></Icon>;
export const IconFlash = (p) => <Icon {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />;
export const IconRefresh = (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></Icon>;
export const IconLogout = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Icon>;
export const IconGift = (p) => <Icon {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9M8 8a2 2 0 01-2-2V4h4c1.1 0 2 .9 2 2M16 8a2 2 0 002-2V4h-4c-1.1 0-2 .9-2 2" /></Icon>;
export const IconMicrophone = (p) => <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" /></Icon>;
export const IconSparkles = (p) => <Icon {...p}><path d="M12 3l1.45 4.45L18 9l-4.55 1.55L12 15l-1.45-4.45L6 9l4.55-1.55L12 3zM5 3v4M3 5h4M19 17v4M17 19h4" /></Icon>;
