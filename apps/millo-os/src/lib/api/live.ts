const API = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"

export async function getLiveStreams() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`${API}/api/live`, {
      signal: controller.signal,
      next: { revalidate: 30 }
    })

    clearTimeout(timeout)

    if (!res.ok) return []

    return await res.json()
  } catch {
    clearTimeout(timeout)
    return []
  }
}
