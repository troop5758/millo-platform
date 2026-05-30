import { NextResponse } from "next/server"

const SERVICE =
  process.env.LIVE_SERVICE_URL ||
  "http://millo-live-media:6001"

export async function GET() {
  try {
    const res = await fetch(
      `${SERVICE}/api/live`,
      {
        next: { revalidate: 30 }
      }
    )

    return NextResponse.json(
      await res.json()
    )
  } catch {
    return NextResponse.json([])
  }
}
