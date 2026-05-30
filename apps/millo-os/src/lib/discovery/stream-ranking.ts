import { calculateTrendingScore } from "./trending-engine"

export function rankStreams(streams:any) {
return streams
.map((stream:any) => ({
...stream,
score: calculateTrendingScore({
engagement: stream.engagement,
velocity: stream.velocity,
watchTime: stream.watchTime,
revenue: stream.revenue
})
}))
.sort((a:any,b:any) => b.score - a.score)
}
