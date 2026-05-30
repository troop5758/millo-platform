export const dynamic = "force-dynamic"

import AppShell from "@/components/layout/app-shell"

import HeroBanner from "@/components/home/hero-banner"

import LiveRail from "@/components/surfaces/live-rail"
import CreatorRail from "@/components/surfaces/creator-rail"
import MarketplaceRail from "@/components/surfaces/marketplace-rail"
import RevenuePanel from "@/components/surfaces/revenue-panel"
import TelemetryPanel from "@/components/surfaces/telemetry-panel"

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-16">

        <HeroBanner />

        <LiveRail />

        <CreatorRail />

        <MarketplaceRail />

        <RevenuePanel />

        <TelemetryPanel />

      </div>
    </AppShell>
  )
}
