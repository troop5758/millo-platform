import React, { lazy, Suspense, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { withPageErrorBoundary } from './components/PageErrorBoundary';
import { SiftBeacon } from './components/SiftBeacon';
import { AdminRoute } from './guards/AdminRoute';
import { TrustStatusProvider } from './trust/TrustStatusContext';

/* Eagerly-loaded shell — needed on every render */
import { LandingPage }   from './pages/LandingPage';
import { NotFoundPage }  from './pages/NotFoundPage';

/* Route-level code splitting — each page loads only when first visited */
const HelpCenterPage      = lazy(() => import('./pages/HelpCenterPage').then(m => ({ default: m.HelpCenterPage })));
const CreatorPage         = lazy(() => import('./pages/CreatorPage').then(m => ({ default: m.CreatorPage })));
const MillaPage           = lazy(() => import('./pages/MillaPage').then(m => ({ default: m.MillaPage })));
const ShopfrontPage       = lazy(() => import('./pages/ShopfrontPage').then(m => ({ default: m.ShopfrontPage })));
const ProductDetailPage   = lazy(() => import('./pages/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const AuctionsPage        = lazy(() => import('./pages/AuctionsPage').then(m => ({ default: m.AuctionsPage })));
const LiveNowPage         = lazy(() => import('./pages/LiveNowPage').then(m => ({ default: m.LiveNowPage })));
const DiscoveryForYouFeedPage = lazy(() => import('./pages/Feed'));
const CreatorsDiscoverPage = lazy(() => import('./pages/Creators'));
const ActivityFeedPage    = lazy(() => import('./pages/activity/ActivityFeedPage'));
const ProfileActivityPage = lazy(() => import('./pages/activity/ProfileActivityPage'));
const DisputesPage        = lazy(() => import('./pages/disputes/DisputesPage'));
const AdminDisputesPage   = lazy(() => import('./pages/disputes/AdminDisputesPage'));
const OpsHealthPage       = lazy(() => import('./pages/ops/OpsHealthPage'));
const WorkerHealthPage    = lazy(() => import('./pages/ops/WorkerHealthPage'));
const QueueDashboardPageUi = lazy(() => import('./pages/ops/QueueDashboardPage'));
const SellerOnboardingPage = lazy(() => import('./pages/seller/SellerOnboardingPage'));
const AIControlsPage      = lazy(() => import('./pages/admin/AIControlsPage'));
const TermsPage           = lazy(() => import('./pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPage         = lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const DmcaPage            = lazy(() => import('./pages/DmcaPage').then(m => ({ default: m.DmcaPage })));
const AdminPage           = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AdminMetrics       = lazy(() => import('./pages/AdminMetrics').then(m => ({ default: m.default })));
const AdminDashboard     = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.default })));
const SupportPage         = lazy(() => import('./pages/SupportPage').then(m => ({ default: m.SupportPage })));
const SupportFormPage     = lazy(() => import('./pages/SupportFormPage').then(m => ({ default: m.SupportFormPage })));
const SupportMyTicketsPage = lazy(() => import('./pages/SupportMyTicketsPage').then(m => ({ default: m.SupportMyTicketsPage })));
const TicketTrackingPage  = lazy(() => import('./pages/TicketTrackingPage').then(m => ({ default: m.TicketTrackingPage })));
const ModeratorPage       = lazy(() => import('./pages/ModeratorPage').then(m => ({ default: m.ModeratorPage })));
const LoginPage           = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ProfilePage         = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const EditProfilePage     = lazy(() => import('./pages/EditProfilePage').then(m => ({ default: m.EditProfilePage })));
const FollowersFollowingPage = lazy(() => import('./pages/FollowersFollowingPage').then(m => ({ default: m.FollowersFollowingPage })));
const WalletPage          = lazy(() => import('./pages/WalletPage').then(m => ({ default: m.WalletPage })));
const PrivacySettingsPage = lazy(() => import('./pages/PrivacySettingsPage').then(m => ({ default: m.PrivacySettingsPage })));
const SessionsPage        = lazy(() => import('./pages/SessionsPage').then(m => ({ default: m.SessionsPage })));
const BlockedUsersPage    = lazy(() => import('./pages/BlockedUsersPage').then(m => ({ default: m.BlockedUsersPage })));
const CoinStorePage       = lazy(() => import('./pages/CoinStorePage').then(m => ({ default: m.CoinStorePage })));
const PricingPage         = lazy(() => import('./pages/PricingPage').then(m => ({ default: m.PricingPage })));
const RegisterPage        = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ResetPasswordPage   = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const GoLivePage          = lazy(() => import('./pages/GoLivePage').then(m => ({ default: m.GoLivePage })));
const ScheduleStreamPage  = lazy(() => import('./pages/ScheduleStreamPage').then(m => ({ default: m.ScheduleStreamPage })));
const UpcomingStreamsPage = lazy(() => import('./pages/UpcomingStreamsPage').then(m => ({ default: m.UpcomingStreamsPage })));
const EventCountdownPage  = lazy(() => import('./pages/EventCountdownPage').then(m => ({ default: m.EventCountdownPage })));
const DMPage              = lazy(() => import('./pages/DMPage').then(m => ({ default: m.DMPage })));
const CallsPage           = lazy(() => import('./pages/CallsPage').then(m => ({ default: m.default })));
const CheckoutPage        = lazy(() => import('./pages/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const OAuthCallbackPage   = lazy(() => import('./pages/OAuthCallbackPage').then(m => ({ default: m.OAuthCallbackPage })));
const VerifyEmailPage     = lazy(() => import('./pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const VODPage             = lazy(() => import('./pages/VODPage').then(m => ({ default: m.VODPage })));
const CreatorApplyPage    = lazy(() => import('./pages/CreatorApplyPage').then(m => ({ default: m.CreatorApplyPage })));
const CreatorDashboardPage = lazy(() => import('./pages/CreatorDashboardPage').then(m => ({ default: m.CreatorDashboardPage })));
const BrandDashboardPage  = lazy(() => import('./pages/BrandDashboardPage').then(m => ({ default: m.BrandDashboardPage })));
const SearchPage          = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const SubscribePage       = lazy(() => import('./pages/SubscribePage').then(m => ({ default: m.SubscribePage })));
const ReplayPage          = lazy(() => import('./pages/ReplayPage').then(m => ({ default: m.ReplayPage })));
const TVPairingPage       = lazy(() => import('./pages/TVPairingPage').then(m => ({ default: m.TVPairingPage })));
const MusicLibraryPage   = lazy(() => import('./pages/MusicLibraryPage').then(m => ({ default: m.MusicLibraryPage })));
const TrendingSoundsPage = lazy(() => import('./pages/TrendingSoundsPage').then(m => ({ default: m.TrendingSoundsPage })));

// Auth aliases / Phase 1 UI scaffolding
const ForgotPasswordAliasPage = lazy(() => import('./pages/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const DeviceManagementAliasPage = lazy(() => import('./pages/auth/DeviceManagementPage').then(m => ({ default: m.DeviceManagementPage })));
const SessionsAliasPage      = lazy(() => import('./pages/auth/SessionsAliasPage').then(m => ({ default: m.SessionsAliasPage })));

const VideoPage             = lazy(() => import('./pages/video/VideoPage').then(m => ({ default: m.VideoPage })));
const UploadPage            = lazy(() => import('./pages/video/UploadPage').then(m => ({ default: m.UploadPage })));
const CreatorStudio          = lazy(() => import('./pages/video/CreatorStudio').then(m => ({ default: m.CreatorStudio })));
const AnalyticsPage         = lazy(() => import('./pages/video/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));

const LiveStreamPage         = lazy(() => import('./pages/live/LiveStreamPage').then(m => ({ default: m.LiveStreamPage })));
const LiveSchedulePage       = lazy(() => import('./pages/live/LiveSchedulePage').then(m => ({ default: m.LiveSchedulePage })));
const WaitingRoomPage        = lazy(() => import('./pages/live/WaitingRoomPage').then(m => ({ default: m.WaitingRoomPage })));
const LiveModerationAliasPage = lazy(() => import('./pages/live/LiveModerationAliasPage').then(m => ({ default: m.LiveModerationAliasPage })));

const StorePage             = lazy(() => import('./pages/store/StorePage').then(m => ({ default: m.StorePage })));
const ProductPage           = lazy(() => import('./pages/store/ProductPage').then(m => ({ default: m.ProductPage })));
const OrdersPage            = lazy(() => import('./pages/store/OrdersPage').then(m => ({ default: m.OrdersPage })));
const AuctionLiveListPage  = lazy(() => import('./pages/store/AuctionLiveListPage').then(m => ({ default: m.AuctionLiveListPage })));
const AuctionDetailPage    = lazy(() => import('./pages/store/AuctionDetailPage').then(m => ({ default: m.AuctionDetailPage })));

const TransactionsPage      = lazy(() => import('./pages/monetization/TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const PayoutsPage           = lazy(() => import('./pages/monetization/PayoutsPage').then(m => ({ default: m.PayoutsPage })));
const SubscriptionsPage     = lazy(() => import('./pages/monetization/SubscriptionsPage').then(m => ({ default: m.SubscriptionsPage })));
const SubscriptionsManagePage = lazy(() => import('./pages/monetization/SubscriptionsManagePage').then(m => ({ default: m.SubscriptionsManagePage })));
const SupportCreateAliasPage = lazy(() => import('./pages/support/SupportCreatePage').then(m => ({ default: m.SupportCreatePage })));
const SupportHistoryAliasPage = lazy(() => import('./pages/support/SupportHistoryPage').then(m => ({ default: m.SupportHistoryPage })));
const SupportAdminAliasPage  = lazy(() => import('./pages/support/SupportAdminPage').then(m => ({ default: m.SupportAdminPage })));
const SupportTrackingAliasPage = lazy(() => import('./pages/support/SupportTrackingPage').then(m => ({ default: m.SupportTrackingPage })));
const TicketPage = lazy(() => import('./pages/support/TicketPage').then(m => ({ default: m.TicketPage })));

const AdminUsersPage        = lazy(() => import('./pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminModerationPage   = lazy(() => import('./pages/admin/AdminModerationPage').then(m => ({ default: m.AdminModerationPage })));
const AdminPayoutsPage      = lazy(() => import('./pages/admin/AdminPayoutsPage').then(m => ({ default: m.AdminPayoutsPage })));
const AdminAuditPage        = lazy(() => import('./pages/admin/AdminAuditPage').then(m => ({ default: m.AdminAuditPage })));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #7c3aed', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/** Legacy player URL — canonical live viewer is `/live/:streamId`. */
function LiveStreamLegacyRedirect() {
  const { streamId } = useParams();
  return <Navigate to={`/live/${encodeURIComponent(streamId || '')}`} replace />;
}

/** Short subscribe link — canonical checkout is `/subscribe/:creatorId`. */
function SubscribeShortRedirect() {
  const { creatorId } = useParams();
  return <Navigate to={`/subscribe/${encodeURIComponent(creatorId || '')}`} replace />;
}

function AppRoutes() {
  useEffect(() => {
    import('./lib/behavior')
      .then((m) => m.initBehaviorTracking())
      .catch(() => {});
    import('./lib/behaviorCollector')
      .then((m) => m.initBehaviorCollector())
      .catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <TrustStatusProvider>
      <SiftBeacon />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={withPageErrorBoundary(<LandingPage />)} />
        <Route element={<Layout />}>
          <Route path="live" element={withPageErrorBoundary(<LiveNowPage />)} />
          <Route path="feed" element={withPageErrorBoundary(<DiscoveryForYouFeedPage />)} />
          <Route path="feed/classic" element={<Navigate to="/feed" replace />} />
          <Route path="creators" element={withPageErrorBoundary(<CreatorsDiscoverPage />)} />
          <Route path="foryou" element={<Navigate to="/feed" replace />} />
          <Route path="profile" element={withPageErrorBoundary(<ProfilePage />)} />
          <Route path="profile/edit" element={withPageErrorBoundary(<EditProfilePage />)} />
          <Route path="profile/:userId/activity" element={withPageErrorBoundary(<ProfileActivityPage />)} />
          <Route path="profile/followers" element={<Navigate to="/creator/me/followers" replace />} />
          <Route path="profile/following" element={<Navigate to="/creator/me/following" replace />} />
          <Route path="wallet" element={withPageErrorBoundary(<WalletPage />)} />
          <Route path="transactions" element={withPageErrorBoundary(<TransactionsPage />)} />
          <Route path="payouts" element={withPageErrorBoundary(<PayoutsPage />)} />
          <Route path="subscriptions" element={withPageErrorBoundary(<SubscriptionsPage />)} />
          <Route path="subscriptions/manage" element={withPageErrorBoundary(<SubscriptionsManagePage />)} />
          <Route path="settings/privacy" element={withPageErrorBoundary(<PrivacySettingsPage />)} />
          <Route path="settings/sessions" element={withPageErrorBoundary(<SessionsPage />)} />
          <Route path="device-management" element={withPageErrorBoundary(<DeviceManagementAliasPage />)} />
          <Route path="sessions" element={withPageErrorBoundary(<SessionsAliasPage />)} />
          <Route path="blocked" element={withPageErrorBoundary(<BlockedUsersPage />)} />
          <Route path="login" element={withPageErrorBoundary(<LoginPage />)} />
          <Route path="signup" element={withPageErrorBoundary(<RegisterPage />)} />
          <Route path="forgot-password" element={withPageErrorBoundary(<ForgotPasswordAliasPage />)} />
          <Route path="help" element={withPageErrorBoundary(<HelpCenterPage />)} />
          <Route path="activity" element={withPageErrorBoundary(<ActivityFeedPage />)} />
          <Route path="disputes" element={withPageErrorBoundary(<DisputesPage />)} />
          <Route path="seller/onboarding" element={withPageErrorBoundary(<SellerOnboardingPage />)} />
          <Route path="ops/health" element={withPageErrorBoundary(<AdminRoute><OpsHealthPage /></AdminRoute>)} />
          <Route path="ops/workers" element={withPageErrorBoundary(<AdminRoute><WorkerHealthPage /></AdminRoute>)} />
          <Route path="ops/queues" element={withPageErrorBoundary(<AdminRoute><QueueDashboardPageUi /></AdminRoute>)} />
          <Route path="music" element={withPageErrorBoundary(<MusicLibraryPage />)} />
          <Route path="sounds/trending" element={withPageErrorBoundary(<TrendingSoundsPage />)} />
          <Route path="creator/milla" element={withPageErrorBoundary(<MillaPage />)} />
          <Route path="creator/:id" element={withPageErrorBoundary(<CreatorPage />)} />
          <Route path="creator/:id/followers" element={withPageErrorBoundary(<FollowersFollowingPage />)} />
          <Route path="creator/:id/following" element={withPageErrorBoundary(<FollowersFollowingPage />)} />
          <Route path="creator/:id/shop" element={withPageErrorBoundary(<ShopfrontPage />)} />
          <Route path="creator/:id/auctions" element={withPageErrorBoundary(<AuctionsPage />)} />
          <Route path="creator/:id/shop/:productId" element={withPageErrorBoundary(<ProductDetailPage />)} />
          <Route path="terms" element={withPageErrorBoundary(<TermsPage />)} />
          <Route path="privacy" element={withPageErrorBoundary(<PrivacyPage />)} />
          <Route path="legal/dmca" element={withPageErrorBoundary(<DmcaPage />)} />
          <Route path="admin" element={withPageErrorBoundary(<AdminRoute><AdminPage /></AdminRoute>)} />
          <Route path="admin/metrics" element={withPageErrorBoundary(<AdminRoute><AdminMetrics /></AdminRoute>)} />
          <Route path="admin/ops" element={withPageErrorBoundary(<AdminRoute><AdminDashboard /></AdminRoute>)} />
          <Route path="admin/users" element={withPageErrorBoundary(<AdminRoute><AdminUsersPage /></AdminRoute>)} />
          <Route path="admin/moderation" element={withPageErrorBoundary(<AdminRoute><AdminModerationPage /></AdminRoute>)} />
          <Route path="admin/payouts" element={withPageErrorBoundary(<AdminRoute><AdminPayoutsPage /></AdminRoute>)} />
          <Route path="admin/audit" element={withPageErrorBoundary(<AdminRoute><AdminAuditPage /></AdminRoute>)} />
          <Route path="admin/disputes" element={withPageErrorBoundary(<AdminRoute><AdminDisputesPage /></AdminRoute>)} />
          <Route path="admin/ai-controls" element={withPageErrorBoundary(<AdminRoute><AIControlsPage /></AdminRoute>)} />
          <Route path="support" element={withPageErrorBoundary(<SupportPage />)} />
          <Route path="support/request" element={withPageErrorBoundary(<SupportFormPage />)} />
          <Route path="support/my" element={withPageErrorBoundary(<SupportMyTicketsPage />)} />
          <Route path="support/track" element={withPageErrorBoundary(<TicketTrackingPage />)} />
          <Route path="support/create" element={withPageErrorBoundary(<SupportCreateAliasPage />)} />
          <Route path="support/history" element={withPageErrorBoundary(<SupportHistoryAliasPage />)} />
          <Route path="support/admin" element={withPageErrorBoundary(<SupportAdminAliasPage />)} />
          <Route path="support/tracking/:trackingNumber" element={withPageErrorBoundary(<SupportTrackingAliasPage />)} />
          <Route path="support/:ticketId" element={withPageErrorBoundary(<TicketPage />)} />
          <Route path="mod" element={withPageErrorBoundary(<ModeratorPage />)} />
          <Route path="coins"          element={withPageErrorBoundary(<CoinStorePage />)} />
          <Route path="pricing"        element={withPageErrorBoundary(<PricingPage />)} />
          <Route path="register"       element={<Navigate to="/signup" replace />} />
          <Route path="reset-password" element={withPageErrorBoundary(<ResetPasswordPage />)} />
          <Route path="creator/studio" element={withPageErrorBoundary(<CreatorStudio />)} />
          <Route path="analytics" element={withPageErrorBoundary(<AnalyticsPage />)} />
          <Route path="go-live"          element={withPageErrorBoundary(<GoLivePage />)} />
          <Route path="schedule-stream"   element={withPageErrorBoundary(<ScheduleStreamPage />)} />
          <Route path="live/schedule" element={withPageErrorBoundary(<LiveSchedulePage />)} />
          <Route path="live/upcoming"      element={withPageErrorBoundary(<UpcomingStreamsPage />)} />
          <Route path="live/events/:eventId" element={withPageErrorBoundary(<EventCountdownPage />)} />
          <Route path="live/moderation" element={withPageErrorBoundary(<LiveModerationAliasPage />)} />
          <Route path="live/waiting-room/:id" element={withPageErrorBoundary(<WaitingRoomPage />)} />
          <Route path="live/stream/:streamId" element={<LiveStreamLegacyRedirect />} />
          <Route path="live/:streamId" element={withPageErrorBoundary(<LiveStreamPage />)} />
          <Route path="messages"         element={withPageErrorBoundary(<DMPage />)} />
          <Route path="calls"           element={withPageErrorBoundary(<CallsPage />)} />
          <Route path="checkout"         element={withPageErrorBoundary(<CheckoutPage />)} />
          <Route path="oauth-callback"      element={withPageErrorBoundary(<OAuthCallbackPage />)} />
          <Route path="coins/success"       element={withPageErrorBoundary(<CoinStorePage />)} />
          <Route path="checkout/success"    element={withPageErrorBoundary(<CheckoutPage />)} />
          <Route path="verify-email"          element={withPageErrorBoundary(<VerifyEmailPage />)} />
          <Route path="verify-email/success"  element={withPageErrorBoundary(<VerifyEmailPage />)} />
          <Route path="vod"                   element={withPageErrorBoundary(<VODPage />)} />
          <Route path="video/:id"           element={withPageErrorBoundary(<VideoPage />)} />
          <Route path="upload"              element={withPageErrorBoundary(<UploadPage />)} />
          <Route path="upload/edit"        element={withPageErrorBoundary(<UploadPage />)} />
          <Route path="creator-apply"         element={withPageErrorBoundary(<CreatorApplyPage />)} />
          <Route path="dashboard"             element={withPageErrorBoundary(<CreatorDashboardPage />)} />
          <Route path="brand"                 element={withPageErrorBoundary(<BrandDashboardPage />)} />
          <Route path="ads"                   element={withPageErrorBoundary(<BrandDashboardPage />)} />
          <Route path="search"                element={withPageErrorBoundary(<SearchPage />)} />
          <Route path="notifications"            element={withPageErrorBoundary(<NotificationsPage />)} />
          <Route path="subscribe/:creatorId" element={withPageErrorBoundary(<SubscribePage />)} />
          <Route path="s/:creatorId" element={<SubscribeShortRedirect />} />
          <Route path="creator/:id/replays/:replayId" element={withPageErrorBoundary(<ReplayPage />)} />
          <Route path="tv-pairing" element={withPageErrorBoundary(<TVPairingPage />)} />
          {/* Browse creator storefronts (slug routes below). */}
          <Route path="store" element={withPageErrorBoundary(<CreatorsDiscoverPage />)} />
          <Route path="store/:creator" element={withPageErrorBoundary(<StorePage />)} />
          <Route path="product/:id" element={withPageErrorBoundary(<ProductPage />)} />
          <Route path="orders" element={withPageErrorBoundary(<OrdersPage />)} />
          <Route path="auction/live" element={withPageErrorBoundary(<AuctionLiveListPage />)} />
          <Route path="auction/:id" element={withPageErrorBoundary(<AuctionDetailPage />)} />
          {/* Intentional: /shop is not commerce; send users to discovery (storefronts live under /store/:creator). */}
          <Route path="shop" element={<Navigate to="/feed" replace />} />
          <Route path="*"    element={<NotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
      </TrustStatusProvider>
    </BrowserRouter>
  );
}

/* Inline translations for the error boundary — i18n cannot be trusted when the app crashes */
const ERROR_COPY = {
  en: { title: 'Something went wrong',          body: "We've been notified and are looking into it.", btn: 'Reload page' },
  es: { title: 'Algo salió mal',                body: 'Hemos sido notificados y lo estamos investigando.', btn: 'Recargar' },
  fr: { title: 'Quelque chose s\'est mal passé', body: 'Nous avons été notifiés et examinons le problème.', btn: 'Recharger' },
  pt: { title: 'Algo correu mal',               body: 'Fomos notificados e estamos a investigar.',         btn: 'Recarregar' },
  ar: { title: 'حدث خطأ ما',                    body: 'تم إخطارنا ونحن نحقق في الأمر.',                  btn: 'إعادة التحميل' },
};

function getErrorCopy() {
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return ERROR_COPY[lang] || ERROR_COPY.en;
}

function ErrorFallback() {
  const copy = getErrorCopy();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{copy.title}</p>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>{copy.body}</p>
      <button style={{ padding: '8px 20px', borderRadius: 10, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        onClick={() => window.location.reload()}>
        {copy.btn}
      </button>
    </div>
  );
}

export default Sentry.withErrorBoundary(AppRoutes, { fallback: <ErrorFallback /> });
