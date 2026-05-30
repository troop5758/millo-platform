import { NextResponse } from "next/server"

const SERVICE =
  process.env.ECONOMY_SERVICE_URL ||
  "http://millo-economy-service:7001"

export async function GET() {
  try {
    const res = await fetch(
      `${SERVICE}/api/revenue`,
      {
        next: { revalidate: 60 }
      }
    )

    return NextResponse.json(
      await res.json()
    )
  } catch {
    return NextResponse.json({})
  }
}
