export function collaborativeFilter(
candidates: any[]
) {
return candidates.map((item:any) => ({
...item,
collaborativeScore:
item.engagement || 0
}))
}
