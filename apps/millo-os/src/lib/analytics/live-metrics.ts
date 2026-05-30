export function viewerMomentum(stream:any) {
return (
stream.viewers || 0
) * (
stream.growthRate || 1
)
}
