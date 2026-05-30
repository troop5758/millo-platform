import AppShell from "@/components/layout/app-shell"
import GlassCard from "@/components/ui/glass-card"

export default function DiscoverPage() {
return ( <AppShell> <h1 className="text-5xl font-bold mb-8">
Discover </h1>

  <div className="grid lg:grid-cols-5 gap-6">
    <GlassCard>Trending Creators</GlassCard>
    <GlassCard>Trending Topics</GlassCard>
    <GlassCard>Suggested Streams</GlassCard>
    <GlassCard>Recommended Products</GlassCard>
    <GlassCard>Discovery Feed</GlassCard>
  </div>
</AppShell>

)
}
