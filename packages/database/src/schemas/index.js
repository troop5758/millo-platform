/**
 * All MongoDB schemas — authoritative. Indexes compile via syncIndexes().
 * No controllers. https://milloapp.com
 */
const User = require('./User');
const Session = require('./Session');
const Profile = require('./Profile');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const LedgerEntry = require('./LedgerEntry');
const Battle = require('./Battle');
const BattleParticipant = require('./BattleParticipant');
const LiveStream = require('./LiveStream');
const LiveEvent = require('./LiveEvent');
const EventAttendance = require('./EventAttendance');
const EventComment = require('./EventComment');
const ScheduledStream = require('./ScheduledStream');
const LiveViewer = require('./LiveViewer');
const Level = require('./Level');
const TrustScore = require('./TrustScore');
const AccountTrustScore = require('./AccountTrustScore');
const TrustHistory = require('./TrustHistory');
const TrustEdge = require('./TrustEdge');
const TrustGraphLink = require('./TrustGraphLink');
const Ad = require('./Ad');
const AdImpression = require('./AdImpression');
const Campaign = require('./Campaign');
const Dashboard = require('./Dashboard');
const DashboardWidget = require('./DashboardWidget');
const TVChannel = require('./TVChannel');
const TVSchedule = require('./TVSchedule');
const TVPairingCode = require('./TVPairingCode');
const TVDevice = require('./TVDevice');
const Notification = require('./Notification');
const NotificationLog = require('./NotificationLog');
const AuditLog = require('./AuditLog');
const FinancialAuditLog = require('./FinancialAuditLog');
const AdminAuditLog = require('./AdminAuditLog');
const Report = require('./Report');
const ModerationLog = require('./ModerationLog');
const ModerationQueue = require('./ModerationQueue');
const Invite = require('./Invite');
const LoginAudit = require('./LoginAudit');
const LoginEvent = require('./LoginEvent');
const Subscription = require('./Subscription');
const DMSession = require('./DMSession');
const DMOfflineEvent = require('./DMOfflineEvent');
const AdDailySpend = require('./AdDailySpend');
const IdempotencyRecord = require('./IdempotencyRecord');
const PayoutRequest = require('./PayoutRequest');
const PayoutHold    = require('./PayoutHold');
const SupportTicket = require('./SupportTicket');
const SupportTicketMessage = require('./SupportTicketMessage');
const Counter = require('./Counter');
const Appeal = require('./Appeal');
const ConsentLog = require('./ConsentLog');
const Follow = require('./Follow');
const Block = require('./Block');
const DMMessage = require('./DMMessage');
const PlatformSettings = require('./PlatformSettings');
const PlatformCreatorAccess = require('./PlatformCreatorAccess');
const Product             = require('./Product');
const Auction             = require('./Auction');
const CreatorApplication  = require('./CreatorApplication');
const PpvPurchase         = require('./PpvPurchase');
const PpvBundle           = require('./PpvBundle');
const PpvMessage          = require('./PpvMessage');
const PpvAnalytics        = require('./PpvAnalytics');
const PpvContent          = require('./PpvContent');
const PpvMassMessage      = require('./PpvMassMessage');
const PpvContentPurchase  = require('./PpvContentPurchase');
const PaidMessage         = require('./PaidMessage');
const PpvContentAnalytics = require('./PpvContentAnalytics');
const Order               = require('./Order');
const Region              = require('./Region');
const PricingModel        = require('./PricingModel');
const CurrencyRate        = require('./CurrencyRate');
const TaxRecord           = require('./TaxRecord');
const CreatorWallet       = require('./CreatorWallet');
const PaymentTransaction  = require('./PaymentTransaction');
const PaymentMethod       = require('./PaymentMethod');
const PaymentReference    = require('./PaymentReference');
const CreatorKyc         = require('./CreatorKyc');
const CreatorAccelerator   = require('./CreatorAccelerator');
const CreatorTier          = require('./CreatorTier');
const FanProfile           = require('./FanProfile');
const MonetizationEvent    = require('./MonetizationEvent');
const MoneyIndex           = require('./MoneyIndex');
const MoneyProviderLedgerEntry = require('./MoneyProviderLedgerEntry');
const UpsellFunnel         = require('./UpsellFunnel');
const LiveTicket           = require('./LiveTicket');
const Referral             = require('./Referral');
const UserStreak           = require('./UserStreak');
const EngagementBadge      = require('./EngagementBadge');
const CreatorBadge         = require('./CreatorBadge');
const SubscriptionTier     = require('./SubscriptionTier');
const StreamLike           = require('./StreamLike');
const StreamShare          = require('./StreamShare');
const StreamComment        = require('./StreamComment');
const AuctionComment       = require('./AuctionComment');
const MeetingMessage       = require('./MeetingMessage');
const ContentEngagement    = require('./ContentEngagement');
const ContentBookmark     = require('./ContentBookmark');
const ContentAuthenticity = require('./ContentAuthenticity');
const CreatorReputation   = require('./CreatorReputation');
const CreatorTrustHistory = require('./CreatorTrustHistory');
const DsarRequest          = require('./DsarRequest');
const FraudEvent           = require('./FraudEvent');
const MonetizationRiskAlert = require('./MonetizationRiskAlert');
const CreatorReviewQueue   = require('./CreatorReviewQueue');
const Chargeback           = require('./Chargeback');
const DeviceFingerprint    = require('./DeviceFingerprint');
const DeviceReputation     = require('./DeviceReputation');
const DiscoveryModel      = require('./DiscoveryModel');
const PlatformMetric      = require('./PlatformMetric');
const EventBusLog         = require('./EventBusLog');
const MarketingCampaign   = require('./MarketingCampaign');
const MarketingAttribution= require('./MarketingAttribution');
const UserSecurity        = require('./UserSecurity');
const UserStrike          = require('./UserStrike');
const VerificationToken   = require('./VerificationToken');
const SellerVerification  = require('./SellerVerification');
const Dispute             = require('./Dispute');
const StorefrontCustomization = require('./StorefrontCustomization');
const CreatorCoupon       = require('./CreatorCoupon');
const StoreAnalytics      = require('./StoreAnalytics');
const VideoProduct        = require('./VideoProduct');
const Activity            = require('./Activity');
const DeviceAnalytics     = require('./DeviceAnalytics');
const LiveFilter          = require('./LiveFilter');
const Gift                = require('./Gift');
const HashtagTrend        = require('./HashtagTrend');
const Penalty             = require('./Penalty');
const UserDevice          = require('./UserDevice');
const CoHostInvite        = require('./CoHostInvite');
const StreamModerator     = require('./StreamModerator');
const LiveStreamMetrics   = require('./LiveStreamMetrics');
const LiveDeviceMetrics   = require('./LiveDeviceMetrics');
const CoinPack            = require('./CoinPack');
const DmcaNotice          = require('./DmcaNotice');
const MusicLicense        = require('./MusicLicense');
const MusicTrack          = require('./MusicTrack');
const CompositionJob      = require('./CompositionJob');
const VideoSound          = require('./VideoSound');
const MusicArtist         = require('./MusicArtist');
const MusicTrackEarning   = require('./MusicTrackEarning');
const SponsoredSound      = require('./SponsoredSound');
const SoundChallenge      = require('./SoundChallenge');
const BehaviorEvent       = require('./BehaviorEvent');
const Behavior            = require('./Behavior');
const Moderation          = require('./Moderation');
const ModerationTrainingData = require('./ModerationTrainingData');
const MlFeatureSnapshot = require('./MlFeatureSnapshot');
const UserProfileFeatures = require('./UserProfileFeatures');
const ContentFeatures = require('./ContentFeatures');
const FeedEvent = require('./FeedEvent');

const models = {
  User,
  Session,
  Profile,
  Wallet,
  Transaction,
  LedgerEntry,
  Battle,
  BattleParticipant,
  LiveStream,
  LiveEvent,
  EventAttendance,
  EventComment,
  ScheduledStream,
  LiveViewer,
  Level,
  TrustScore,
  AccountTrustScore,
  TrustHistory,
  TrustEdge,
  TrustGraphLink,
  Ad,
  AdImpression,
  Campaign,
  Dashboard,
  DashboardWidget,
  TVChannel,
  TVSchedule,
  TVPairingCode,
  TVDevice,
  Notification,
  NotificationLog,
  AuditLog,
  FinancialAuditLog,
  AdminAuditLog,
  Report,
  ModerationLog,
  ModerationQueue,
  Invite,
  LoginAudit,
  LoginEvent,
  Subscription,
  DMSession,
  DMOfflineEvent,
  AdDailySpend,
  IdempotencyRecord,
  PayoutRequest,
  PayoutHold,
  SupportTicket,
  SupportTicketMessage,
  Counter,
  Appeal,
  ConsentLog,
  Follow,
  Block,
  DMMessage,
  PlatformSettings,
  PlatformCreatorAccess,
  Product,
  Auction,
  CreatorApplication,
  PpvPurchase,
  PpvBundle,
  PpvMessage,
  PpvAnalytics,
  PpvContent,
  PpvMassMessage,
  PpvContentPurchase,
  PpvContentAnalytics,
  PaidMessage,
  Order,
  Region,
  PricingModel,
  CurrencyRate,
  TaxRecord,
  CreatorWallet,
  PaymentTransaction,
  PaymentMethod,
  PaymentReference,
  CreatorKyc,
  CreatorAccelerator,
  CreatorTier,
  FanProfile,
  MonetizationEvent,
  MoneyIndex,
  MoneyProviderLedgerEntry,
  UpsellFunnel,
  LiveTicket,
  Referral,
  UserStreak,
  EngagementBadge,
  CreatorBadge,
  SubscriptionTier,
  StreamLike,
  StreamShare,
  StreamComment,
  AuctionComment,
  MeetingMessage,
  ContentEngagement,
  ContentBookmark,
  ContentAuthenticity,
  CreatorReputation,
  CreatorTrustHistory,
  DsarRequest,
  FraudEvent,
  MonetizationRiskAlert,
  CreatorReviewQueue,
  Chargeback,
  DeviceFingerprint,
  DeviceReputation,
  DiscoveryModel,
  PlatformMetric,
  EventBusLog,
  MarketingCampaign,
  MarketingAttribution,
  UserSecurity,
  UserStrike,
  VerificationToken,
  SellerVerification,
  Dispute,
  StorefrontCustomization,
  CreatorCoupon,
  StoreAnalytics,
  VideoProduct,
  Activity,
  DeviceAnalytics,
  LiveFilter,
  Gift,
  HashtagTrend,
  Penalty,
  UserDevice,
  CoHostInvite,
  StreamModerator,
  LiveStreamMetrics,
  LiveDeviceMetrics,
  CoinPack,
  DmcaNotice,
  MusicLicense,
  MusicTrack,
  CompositionJob,
  VideoSound,
  MusicArtist,
  MusicTrackEarning,
  SponsoredSound,
  SoundChallenge,
  BehaviorEvent,
  Behavior,
  Moderation,
  ModerationTrainingData,
  MlFeatureSnapshot,
  UserProfileFeatures,
  ContentFeatures,
  FeedEvent,
};

/** Compile indexes for all models. Call after connect(). */
async function syncIndexes() {
  const list = Object.values(models);
  await Promise.all(list.map((M) => M.syncIndexes()));
}

module.exports = { models, syncIndexes, ...models };
