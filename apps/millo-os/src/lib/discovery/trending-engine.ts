import { RankingInput } from "./ranking.types"

export function calculateTrendingScore(
item: RankingInput
): number {
const engagement = item.engagement || 0
const velocity = item.velocity || 0
const watchTime = item.watchTime || 0
const revenue = item.revenue || 0

return (
engagement * 0.40 +
velocity * 0.30 +
watchTime * 0.20 +
revenue * 0.10
)
}
