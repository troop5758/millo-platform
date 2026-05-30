export interface RankingInput {
engagement?: number
velocity?: number
watchTime?: number
revenue?: number
}

export interface RankedItem extends RankingInput {
score: number
}
