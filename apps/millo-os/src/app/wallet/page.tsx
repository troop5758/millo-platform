import AppShell from "@/components/layout/app-shell"
import GlassCard from "@/components/ui/glass-card"

export default function WalletPage() {
return ( <AppShell> <h1 className="text-5xl font-bold mb-8">
Wallet </h1>

  <div className="grid lg:grid-cols-5 gap-6">
    <GlassCard>Revenue Overview</GlassCard>
    <GlassCard>Balance</GlassCard>
    <GlassCard>Transactions</GlassCard>
    <GlassCard>Payout Schedule</GlassCard>
    <GlassCard>Revenue Graph</GlassCard>
  </div>
</AppShell>

)
}
