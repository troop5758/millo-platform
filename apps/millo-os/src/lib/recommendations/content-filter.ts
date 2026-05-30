export function contentFilter(
  candidates: any[],
  interests: string[]
) {
  return candidates.filter((item: any) => {
    if (!item.category) {
      return true
    }

    return interests.includes(item.category)
  })
}
