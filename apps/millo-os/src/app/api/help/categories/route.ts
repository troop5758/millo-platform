import { NextResponse } from "next/server"

export async function GET() {
return NextResponse.json([
"Getting Started",
"Livestreaming",
"Marketplace",
"Auctions",
"Wallet",
"Creator Monetization",
"Trust & Safety"
])
}
