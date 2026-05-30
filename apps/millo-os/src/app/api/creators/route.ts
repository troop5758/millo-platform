import { NextResponse } from "next/server"

const SERVICE =
  process.env.AUTH_SERVICE_URL ||
  "http://millo-auth-service:4000"

export async function GET() {
  try {
    const res = await fetch(
      `${SERVICE}/api/creators`,
      {
        next: { revalidate: 60 }
      }
    )

    if (!res.ok) {
      return NextResponse.json([])
    }

if (res.status === 401) return NextResponse.json([]);
if (!res.ok) return NextResponse.json([]);
    const data = await res.json()

    return NextResponse.json(data)
  } catch {
    return NextResponse.json([])
  }
}
