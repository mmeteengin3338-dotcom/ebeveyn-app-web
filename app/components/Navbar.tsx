"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "../context/AuthContext"
import { supabase } from "../lib/supabaseClient"

type MsgLite = {
  id?: string | null
  receiver_email?: string | null
  read_at?: string | null
}

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchInput, setSearchInput] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const q = new URLSearchParams(window.location.search).get("q") || ""
    setSearchInput(String(q))
  }, [pathname])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setInterval> | null = null

    async function loadUnreadCount() {
      if (!user?.email) {
        if (active) setUnreadCount(0)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          if (active) setUnreadCount(0)
          return
        }

        const res = await fetch("/api/messages?box=all", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const json = (await res.json().catch(() => ({}))) as { messages?: MsgLite[] }
        const messages = Array.isArray(json.messages) ? json.messages : []
        const me = user.email.toLowerCase()
        let seenIds = new Set<string>()
        if (typeof window !== "undefined") {
          try {
            const raw = window.localStorage.getItem(`seen_message_ids:${me}`)
            const parsed = raw ? (JSON.parse(raw) as string[]) : []
            seenIds = new Set(Array.isArray(parsed) ? parsed : [])
          } catch {
            seenIds = new Set<string>()
          }
        }
        let unread = 0

        for (const m of messages) {
          const receiver = String(m.receiver_email || "").toLowerCase()
          const id = String(m.id || "")
          if (receiver === me && !m.read_at && (!id || !seenIds.has(id))) unread += 1
        }

        if (active) setUnreadCount(unread)
      } catch {
        // no-op: keep last known badge state
      }
    }

    loadUnreadCount()
    if (user?.email) timer = setInterval(loadUnreadCount, 10000)

    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [user?.email])

  useEffect(() => {
    function onUnreadCountChanged(event: Event) {
      const customEvent = event as CustomEvent<number>
      const next = Number(customEvent.detail || 0)
      setUnreadCount(Number.isFinite(next) && next > 0 ? next : 0)
    }

    window.addEventListener("unread-count-changed", onUnreadCountChanged as EventListener)
    return () => {
      window.removeEventListener("unread-count-changed", onUnreadCountChanged as EventListener)
    }
  }, [])

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchInput.trim()
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    router.push(`/${params.toString() ? `?${params.toString()}` : ""}`)
  }

  function menuTabClass(href: string) {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return `block rounded-xl border px-3 py-2 transition-all duration-200 ${
      active
        ? "border-pink-300 bg-pink-100 font-semibold shadow-sm"
        : "border-black/10 bg-white hover:-translate-y-0.5 hover:border-pink-300 hover:bg-pink-50 hover:shadow-sm active:translate-y-0 active:scale-[0.99]"
    }`
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 w-full border-b bg-pink-200/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[98vw] items-center justify-between gap-4 px-4 py-7 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="relative rounded-lg border bg-white px-3 py-2 text-lg leading-none"
              aria-label="Menuyu ac"
            >
              &#9776;
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-rose-600" />
              ) : null}
            </button>
            <Link href="/" className="text-lg font-bold">
              Ebeveyn
            </Link>
          </div>

          <form onSubmit={submitSearch} className="mx-2 hidden flex-1 items-center gap-2 md:flex">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Urun ara..."
              className="w-full rounded-2xl border-2 border-pink-300 bg-white px-5 py-3 text-base font-semibold text-black shadow-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
            />
            <button
              type="submit"
              className="rounded-2xl border-2 border-pink-300 bg-white px-5 py-3 text-sm font-bold text-black transition hover:border-pink-500 hover:bg-pink-50"
            >
              Ara
            </button>
          </form>

          <div className="ml-auto flex gap-3">
            {loading ? null : !user ? (
              <>
                <Link href="/login" className="rounded-lg border bg-white px-4 py-2">
                  Giris Yap
                </Link>
                <Link href="/register" className="rounded-lg bg-pink-400 px-4 py-2">
                  Kayit Ol
                </Link>
              </>
            ) : (
              <>
                <Link href="/owner-products" className="rounded-lg bg-white px-4 py-2">
                  Urun Ekle
                </Link>
                <Link href="/rentals" className="rounded-lg bg-white px-4 py-2">
                  Kiralamalarim
                </Link>
                <button onClick={signOut} className="rounded-lg bg-pink-400 px-4 py-2">
                  Cikis Yap
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <div aria-hidden className="h-24 md:h-28" />

      {menuOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-label="Menuyu kapat"
          />

          <aside className="absolute left-0 top-0 h-full w-72 border-r bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold">Menu</div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border px-3 py-1"
              >
                X
              </button>
            </div>

            <div className="space-y-2">
              <Link
                href="/"
                className={menuTabClass("/")}
                onClick={() => setMenuOpen(false)}
              >
                Ana Sayfa
              </Link>

              {loading ? null : !user ? (
                <>
                  <Link
                    href="/login"
                    className={menuTabClass("/login")}
                    onClick={() => setMenuOpen(false)}
                  >
                    Giris Yap
                  </Link>
                  <Link
                    href="/register"
                    className={menuTabClass("/register")}
                    onClick={() => setMenuOpen(false)}
                  >
                    Kayit Ol
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/profile"
                    className={menuTabClass("/profile")}
                    onClick={() => setMenuOpen(false)}
                  >
                    Profil
                  </Link>
                  <Link
                    href="/rentals"
                    className={menuTabClass("/rentals")}
                    onClick={() => setMenuOpen(false)}
                  >
                    Kiralamalarim
                  </Link>
                  <Link
                    href="/chats"
                    className={`${menuTabClass("/chats")} relative`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>Sohbetler</span>
                    {unreadCount > 0 ? (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {unreadCount}
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    className="block w-full rounded-xl border border-pink-200 bg-pink-100 px-3 py-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-pink-200 hover:shadow-sm active:scale-[0.99]"
                    onClick={async () => {
                      await signOut()
                      setMenuOpen(false)
                    }}
                  >
                    Cikis Yap
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
