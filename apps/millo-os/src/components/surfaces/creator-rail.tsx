import { getCreators } from "@/lib/api/creators"
import { rankCreators } from "@/lib/discovery/creator-ranking"

export default async function CreatorRail() {
  let creators: any[] = []

  try {
    creators = rankCreators(await getCreators())
  } catch (error) {
    console.error("Creator API unavailable:", error)
    creators = []
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">
          Trending Creators
        </h2>

        <span className="text-sm opacity-70">
          {creators.length} creators
        </span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {creators.slice(0, 6).map((creator: any) => (
          <div
            key={creator.id || creator._id || creator.username}
            className="surface p-6"
          >
            <h3 className="font-semibold text-lg">
              {creator.name ||
                creator.displayName ||
                creator.username ||
                "Creator"}
            </h3>

            <p className="text-sm opacity-70">
              Followers: {creator.followers || 0}
            </p>

            <p className="text-sm opacity-70">
              Engagement: {creator.engagement || 0}
            </p>

            <p className="text-sm opacity-70">
              Revenue: ${creator.revenue || 0}
            </p>

            <p className="text-sm opacity-70">
              Score: {Math.round(creator.score || 0)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
