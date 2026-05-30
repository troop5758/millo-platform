import { calculateTrendingScore } from "./trending-engine"

export function rankCreators(creators:any) {
return creators
.map((creator:any) => ({
...creator,
score: calculateTrendingScore({
engagement: creator.engagement,
velocity: creator.velocity,
watchTime: creator.watchTime,
revenue: creator.revenue
})
}))
.sort((a:any,b:any) => b.score - a.score)
}
