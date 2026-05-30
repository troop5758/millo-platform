import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
const q =
req.nextUrl.searchParams.get("q")

return NextResponse.json({
query: q,
results: []
})
}
