import { getTelemetry } from "@/lib/services/telemetry"

export default async function TelemetryPanel() {
let telemetry:any = {}

try {
telemetry = await getTelemetry()
} catch {
telemetry = {}
}

return ( <section className="surface p-8"> <h2 className="text-3xl font-bold mb-6">
Platform Intelligence </h2>

  <div className="grid md:grid-cols-4 gap-4">
    <div>
      Active Users:
      {" "}
      {telemetry.activeUsers || 0}
    </div>

    <div>
      Live Streams:
      {" "}
      {telemetry.liveStreams || 0}
    </div>

    <div>
      Revenue Today:
      {" "}
      ${telemetry.revenueToday || 0}
    </div>

    <div>
      Health:
      {" "}
      {telemetry.health || "Unknown"}
    </div>
  </div>
</section>

)
}
