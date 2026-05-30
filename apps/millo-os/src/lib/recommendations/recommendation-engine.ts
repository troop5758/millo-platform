import { buildInterestProfile } from "./interest-profile"
import { collaborativeFilter } from "./collaborative-filter"
import { contentFilter } from "./content-filter"

export function generateRecommendations(
  userSignals: any,
  candidates: any[]
) {
  const profile =
    buildInterestProfile(userSignals)

  const filtered =
    contentFilter(
      candidates,
      profile.categories
    )

  const ranked =
    collaborativeFilter(filtered)

  return ranked.sort(
    (a: any, b: any) =>
      (b.collaborativeScore || 0) -
      (a.collaborativeScore || 0)
  )
}
