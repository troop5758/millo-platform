import StatusGrid from "@/components/governance/status-grid"

export default function StatusPage() {
  return (
    <main className="max-w-7xl mx-auto py-16 px-6">
      <h1 className="text-5xl font-bold mb-8">
        Platform Status
      </h1>

      <StatusGrid />
    </main>
  )
}
