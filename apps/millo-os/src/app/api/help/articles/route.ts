import { NextResponse } from "next/server"

export async function GET() {
return NextResponse.json([
{
title: "Getting Started",
slug: "getting-started",
category: "onboarding"
}
])
}
