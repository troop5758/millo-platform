import AppShell from "@/components/layout/app-shell"
import GlassCard from "@/components/ui/glass-card"

export default function DashboardPage() {
return ( <AppShell> <h1 className="text-5xl font-bold mb-8">
Dashboard </h1>

  <div className="grid lg:grid-cols-5 gap-6">
    <GlassCard>Revenue</GlassCard>
    <GlassCard>Followers</GlassCard>
    <GlassCard>Engagement</GlassCard>
    <GlassCard>Livestream Stats</GlassCard>
    <GlassCard>Upcoming Events</GlassCard>
  </div>
</AppShell>

)
}
