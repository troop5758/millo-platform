import { UserSignals } from "./recommendation.types"

export function buildInterestProfile(
signals: UserSignals
) {
return {
creators: signals.watchedCreators || [],
streams: signals.watchedStreams || [],
categories: [
...(signals.likedCategories || []),
...(signals.purchasedCategories || [])
]
}
}
