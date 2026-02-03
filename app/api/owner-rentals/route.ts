import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// Temporary compatibility alias.
// Canonical endpoint: /api/owner/rentals
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("sb-access-token")?.value
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 })
    }

    const url = new URL(req.url)
    const status = (url.searchParams.get("status") || "pending").trim()
    const target = `${url.origin}/api/owner/rentals?status=${encodeURIComponent(status)}`

    const res = await fetch(target, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const payload = await res.json().catch(() => ({}))
    return NextResponse.json(payload, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}
