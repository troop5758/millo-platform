import AppShell from "@/components/layout/app-shell"
import GlassCard from "@/components/ui/glass-card"

export default function MarketplacePage() {
return ( <AppShell> <h1 className="text-5xl font-bold mb-8">
Marketplace </h1>

  <div className="grid lg:grid-cols-4 gap-6">
    <GlassCard>Featured Products</GlassCard>
    <GlassCard>Auctions</GlassCard>
    <GlassCard>Recommended Products</GlassCard>
    <GlassCard>Trending Products</GlassCard>
  </div>
</AppShell>

)
}
