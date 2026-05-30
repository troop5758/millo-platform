import ComplianceGrid from "@/components/governance/compliance-grid"

export default function CompliancePage() {
  return (
    <main className="max-w-7xl mx-auto py-16 px-6">
      <h1 className="text-5xl font-bold mb-8">
        Compliance Center
      </h1>

      <ComplianceGrid />
    </main>
  )
}
