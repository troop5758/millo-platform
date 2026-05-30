import { calculateTrendingScore } from "./trending-engine"

export function rankProducts(products:any) {
return products
.map((product:any) => ({
...product,
score: calculateTrendingScore({
engagement: product.engagement,
velocity: product.velocity,
watchTime: product.watchTime,
revenue: product.revenue
})
}))
.sort((a:any,b:any) => b.score - a.score)
}
