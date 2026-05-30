import AppShell from "@/components/layout/app-shell"
import GlassCard from "@/components/ui/glass-card"

export default function LivePage() {
return ( <AppShell> <div className="space-y-8"> <GlassCard>
Featured Stream </GlassCard>

    <div className="grid lg:grid-cols-3 gap-6">
      <GlassCard>Live Grid</GlassCard>
      <GlassCard>Viewer Momentum</GlassCard>
      <GlassCard>Trending Streams</GlassCard>
    </div>
  </div>
</AppShell>

)
}
