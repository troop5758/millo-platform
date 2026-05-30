import { NextResponse } from "next/server"

export async function GET() {
return NextResponse.json({
security: "active",
encryption: "enabled",
compliance: [
"GDPR",
"CCPA"
]
})
}
