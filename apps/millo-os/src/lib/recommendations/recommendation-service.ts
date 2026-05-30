import { generateRecommendations } from "./recommendation-engine"

export async function getRecommendations(
  userSignals: any,
  candidates: any[]
) {
  return generateRecommendations(
    userSignals,
    candidates
  )
}
