import { getLiveStreams } from "@/lib/api/live"
import { rankStreams } from "@/lib/discovery/stream-ranking"

export default async function LiveRail() {
  let streams: any[] = []

  try {
    streams = rankStreams(await getLiveStreams())
  } catch {
    streams = []
  }

  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-bold">
        Live Now
      </h2>

      <div className="grid md:grid-cols-3 gap-4">
        {streams.slice(0, 6).map((stream: any) => (
          <div
            key={stream.id || stream._id}
            className="surface p-6"
          >
            <h3>{stream.title || "Live Stream"}</h3>

            <p>
              Viewers: {stream.viewers || 0}
            </p>

            <p>
              Score: {Math.round(stream.score || 0)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
