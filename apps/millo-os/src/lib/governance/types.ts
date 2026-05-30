export interface SystemHealth {
service: string
status: "healthy" | "warning" | "critical"
latency?: number
}

export interface ComplianceDocument {
title: string
slug: string
updatedAt: string
}
