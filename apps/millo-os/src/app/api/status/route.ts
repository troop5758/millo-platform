import { NextResponse } from "next/server"

export async function GET() {
return NextResponse.json({
timestamp: new Date().toISOString(),
services: [
{
name: "frontend",
status: "healthy"
},
{
name: "database",
status: "healthy"
},
{
name: "redis",
status: "healthy"
},
{
name: "livestream",
status: "healthy"
},
{
name: "payments",
status: "healthy"
}
]
})
}
