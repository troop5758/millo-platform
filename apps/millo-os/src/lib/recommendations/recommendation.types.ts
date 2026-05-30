export interface UserSignals {
watchedCreators?: string[]
watchedStreams?: string[]
likedCategories?: string[]
purchasedCategories?: string[]
subscriptions?: string[]
}

export interface RecommendationResult {
id: string
score: number
}
