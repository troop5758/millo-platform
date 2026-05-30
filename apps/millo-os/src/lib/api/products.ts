const API = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"

export async function getProducts() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`${API}/api/products`, {
      signal: controller.signal,
      next: { revalidate: 60 }
    })

    clearTimeout(timeout)

    if (!res.ok) return []

    return await res.json()
  } catch {
    clearTimeout(timeout)
    return []
  }
}
