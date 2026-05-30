import { NextResponse } from "next/server"

const SERVICE =
  process.env.ANALYTICS_SERVICE_URL ||
  "http://millo-ai-intelligence:8001"

export async function GET() {
  try {
    const res = await fetch(
      `${SERVICE}/api/analytics`,
      {
        next: { revalidate: 30 }
      }
    )

    return NextResponse.json(
      await res.json()
    )
  } catch {
    return NextResponse.json({})
  }
}
