export function creatorScore(creator:any) {
return (
(creator.followers || 0) * 0.4 +
(creator.engagement || 0) * 0.4 +
(creator.revenue || 0) * 0.2
)
}
