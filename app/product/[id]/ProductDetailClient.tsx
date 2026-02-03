"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { supabase } from "@/app/lib/supabaseClient"

type Product = {
  id: string
  title: string
  daily_price: number
  image_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  tags?: string[] | null
  features?: string[] | null
  owner_email?: string | null
  view_count?: number | null
}

const RECENTLY_VIEWED_KEY = "recently_viewed_product_ids"
const RECENTLY_VIEWED_LIMIT = 8

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function calcDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return null
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const days = Math.floor((end - start) / 86400000) + 1
  return days > 0 ? days : null
}

export default function ProductDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [rentLoading, setRentLoading] = useState(false)
  const [showRentForm, setShowRentForm] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [rentedProductIds, setRentedProductIds] = useState<string[]>([])
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const galleryRef = useRef<HTMLDivElement | null>(null)

  const safeId = useMemo(() => String(id ?? "").trim(), [id])
  const chatHref = useMemo(() => {
    const owner = String(product?.owner_email || "").trim().toLowerCase()
    if (!owner) return ""
    return `/chats?product=${encodeURIComponent(safeId)}&peer=${encodeURIComponent(owner)}`
  }, [product?.owner_email, safeId])
  const canMessageOwner = useMemo(() => {
    const owner = String(product?.owner_email || "").trim().toLowerCase()
    if (!owner || !currentUserEmail) return false
    return owner !== currentUserEmail.toLowerCase()
  }, [currentUserEmail, product?.owner_email])
  const rentalDays = useMemo(() => calcDays(startDate, endDate), [startDate, endDate])
  const totalFee = useMemo(() => {
    if (!product || !rentalDays) return null
    return product.daily_price * rentalDays
  }, [product, rentalDays])
  const recentProducts = useMemo(() => {
    if (recentIds.length === 0 || allProducts.length === 0) return []

    const recentSet = new Set(recentIds.filter((x) => x && x !== safeId))
    const byId = new Map(allProducts.map((p) => [p.id, p] as const))
    return recentIds
      .filter((x) => recentSet.has(x))
      .map((pid) => byId.get(pid))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 4)
  }, [allProducts, recentIds, safeId])

  const recommendedProducts = useMemo(() => {
    if (!product || allProducts.length === 0) return []

    const excluded = new Set([safeId, ...recentIds, ...rentedProductIds])
    const viewedTags = new Set<string>()
    const currentTags = new Set((product.tags || []).map((t) => String(t)))

    for (const p of recentProducts) {
      for (const t of p.tags || []) viewedTags.add(String(t))
    }
    for (const t of product.tags || []) viewedTags.add(String(t))

    const scored = allProducts
      .filter((p) => {
        if (excluded.has(p.id)) return false
        if (
          currentUserEmail &&
          p.owner_email &&
          p.owner_email.toLowerCase() === currentUserEmail.toLowerCase()
        ) {
          return false
        }
        return true
      })
      .map((p) => {
        const tags = (p.tags || []).map((t) => String(t))
        const viewedOverlap = tags.reduce((acc, t) => acc + (viewedTags.has(t) ? 1 : 0), 0)
        const currentOverlap = tags.reduce((acc, t) => acc + (currentTags.has(t) ? 1 : 0), 0)
        const priceRatio =
          Math.abs(p.daily_price - product.daily_price) / Math.max(product.daily_price, 1)
        const priceScore = Math.max(0, 3 - priceRatio * 3)
        const score = viewedOverlap * 2 + currentOverlap * 3 + priceScore
        return { p, score }
      })
      .sort((a, b) => b.score - a.score)

    return scored.map((x) => x.p).slice(0, 4)
  }, [allProducts, currentUserEmail, product, recentIds, recentProducts, rentedProductIds, safeId])

  const galleryUrls = useMemo(() => {
    if (!product) return []
    const urls: string[] = []
    if (Array.isArray(product.image_urls)) {
      for (const u of product.image_urls) {
        const val = String(u || "").trim()
        if (val) urls.push(val)
      }
    }
    const single = String(product.image_url || "").trim()
    if (single && !urls.includes(single)) urls.unshift(single)
    return urls.length > 0 ? urls : ["/products/placeholder.jpg"]
  }, [product])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setMsg(null)

      if (!safeId || !isUuid(safeId)) {
        if (!alive) return
        setProduct(null)
        setMsg("Gecersiz id")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(safeId)}`, {
          cache: "no-store",
          signal: controller.signal,
        })

        const json = (await res.json().catch(() => ({}))) as {
          product?: Product
          error?: string
        }
        if (!alive) return

        if (!res.ok) {
          setProduct(null)
          setMsg(json.error || "Urun alinamadi.")
          return
        }

        setProduct(json.product || null)
      } catch (e: unknown) {
        if (!alive) return
        if (e instanceof Error && e.name === "AbortError") return
        setProduct(null)
        setMsg("Baglanti hatasi.")
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }

    load()

    return () => {
      alive = false
      controller.abort()
    }
  }, [safeId])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()

    async function loadProductsForRecommendations() {
      try {
        const res = await fetch("/api/products", {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = (await res.json().catch(() => ({}))) as {
          products?: Product[]
        }

        if (!alive || !res.ok) return
        setAllProducts(Array.isArray(json.products) ? json.products : [])
      } catch (e: unknown) {
        if (!alive) return
        if (e instanceof Error && e.name === "AbortError") return
      }
    }

    loadProductsForRecommendations()
    return () => {
      alive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()

    async function loadUserContext() {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const token = session?.access_token
        const email = session?.user?.email ?? null

        if (!alive) return
        setCurrentUserEmail(email)

        if (!token) return

        const res = await fetch("/api/rentals", {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!res.ok) return

        const json = (await res.json().catch(() => ({}))) as {
          rentals?: Array<{ product_id?: string; status?: string }>
        }
        if (!alive || !Array.isArray(json.rentals)) return

        const ids = json.rentals
          .filter((r) => typeof r?.product_id === "string" && r.product_id)
          .filter((r) => String(r.status || "").toLowerCase() !== "rejected")
          .map((r) => String(r.product_id))
        setRentedProductIds(Array.from(new Set(ids)))
      } catch (e: unknown) {
        if (!alive) return
        if (e instanceof Error && e.name === "AbortError") return
      }
    }

    loadUserContext()
    return () => {
      alive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!product?.id) return

    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_KEY)
      const parsed = raw ? (JSON.parse(raw) as string[]) : []
      const normalized = Array.isArray(parsed)
        ? parsed.filter((x) => typeof x === "string" && x.length > 0)
        : []
      const next = [product.id, ...normalized.filter((x) => x !== product.id)].slice(0, RECENTLY_VIEWED_LIMIT)
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next))
      setRecentIds(next)
    } catch {
      setRecentIds([product.id])
    }
  }, [product?.id])

  useEffect(() => {
    setActiveImageIndex(0)
    if (galleryRef.current) galleryRef.current.scrollLeft = 0
  }, [safeId])

  useEffect(() => {
    if (!safeId || !isUuid(safeId)) return
    const key = `view_ping:${safeId}`
    if (sessionStorage.getItem(key) === "1") return

    sessionStorage.setItem(key, "1")
    fetch(`/api/products/${encodeURIComponent(safeId)}`, {
      method: "POST",
      cache: "no-store",
    }).catch(() => {
      // best effort only
    })
  }, [safeId])

  function clearRecentlyViewed() {
    if (!product?.id) return
    localStorage.removeItem(RECENTLY_VIEWED_KEY)
    // Keep only current detail item in memory so the "recent" section stays empty.
    setRecentIds([product.id])
  }

  async function createRental() {
    if (!showRentForm) {
      setShowRentForm(true)
      setMsg(null)
      return
    }

    setRentLoading(true)
    setMsg(null)

    if (!safeId || !isUuid(safeId)) {
      setMsg("Gecersiz id")
      setRentLoading(false)
      return
    }
    if (!startDate || !endDate) {
      setMsg("Lutfen baslangic ve bitis tarihi secin.")
      setRentLoading(false)
      return
    }
    if (!rentalDays) {
      setMsg("Gecersiz tarih araligi.")
      setRentLoading(false)
      return
    }

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setMsg("Kiralama icin lutfen giris yap.")
        router.push(`/login?next=/product/${encodeURIComponent(safeId)}`)
        return
      }

      const res = await fetch("/api/rentals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: safeId,
          start_date: startDate,
          end_date: endDate,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        setMsg(json.error || "Kiralama talebi olusturulamadi.")
        return
      }

      setMsg("Kiralama talebi olusturuldu.")
      setShowRentForm(false)
      setStartDate("")
      setEndDate("")
    } catch {
      setMsg("Baglanti hatasi.")
    } finally {
      setRentLoading(false)
    }
  }

  if (loading) return <div className="px-6 py-10">Yukleniyor...</div>

  if (!product) {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-bold">Urun bulunamadi</h1>
          <p className="mt-2 text-sm text-red-600">{msg || "Urun bulunamadi."}</p>
          <button
            className="mt-4 rounded-lg border px-4 py-2 text-sm"
            onClick={() => router.push("/")}
          >
            Ana sayfaya don
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="relative">
          <div
            ref={galleryRef}
            className="flex h-80 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(e) => {
              const el = e.currentTarget
              if (!el.clientWidth) return
              const idx = Math.round(el.scrollLeft / el.clientWidth)
              if (idx !== activeImageIndex) setActiveImageIndex(idx)
            }}
          >
            {galleryUrls.map((url, idx) => (
              <div key={`${url}-${idx}`} className="relative h-80 min-w-full snap-start bg-gradient-to-br from-pink-50 to-rose-50">
                <Image
                  src={url}
                  alt={`${product.title} ${idx + 1}`}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 1024px"
                />
              </div>
            ))}
          </div>

          {galleryUrls.length > 1 ? (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-black/35 px-3 py-1.5">
              {galleryUrls.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Gorsel ${idx + 1}`}
                  onClick={() => {
                    const el = galleryRef.current
                    if (!el) return
                    el.scrollTo({ left: el.clientWidth * idx, behavior: "smooth" })
                  }}
                  className={`h-2.5 w-2.5 rounded-full transition ${
                    idx === activeImageIndex ? "bg-white" : "bg-white/45"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{product.title}</h1>
              <p className="mt-2 text-lg">
                Gunluk fiyat: <span className="font-semibold">{product.daily_price} TL</span>
              </p>

              {product.description ? <p className="mt-3 text-sm opacity-80">{product.description}</p> : null}
            </div>

            <div className="w-full max-w-xs rounded-2xl border p-4">
              <div className="text-sm font-semibold">Islemler</div>

              {showRentForm ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />

                  {totalFee !== null ? (
                    <div className="rounded-lg border bg-black/5 px-3 py-2 text-sm">
                      Toplam odeme: <span className="font-semibold">{totalFee} TL</span>
                      <div className="text-xs opacity-70">{rentalDays} gun</div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                className="mt-3 w-full rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={createRental}
                disabled={rentLoading}
              >
                {rentLoading
                  ? "Gonderiliyor..."
                  : showRentForm
                    ? "Talebi gonder"
                    : "Kiralama baslat"}
              </button>

              {showRentForm ? (
                <button
                  className="mt-2 w-full rounded-lg border px-4 py-2 text-sm"
                  onClick={() => setShowRentForm(false)}
                  disabled={rentLoading}
                >
                  Vazgec
                </button>
              ) : null}

              <button
                className="mt-2 w-full rounded-lg border px-4 py-2 text-sm"
                onClick={() => router.push("/")}
              >
                Ana sayfaya don
              </button>

              <button
                className="mt-2 w-full rounded-lg border px-4 py-2 text-sm"
                onClick={() => router.push("/rentals")}
              >
                Kiralamalarim
              </button>

              {canMessageOwner && chatHref ? (
                <Link href={chatHref} className="mt-4 block">
                  <button className="w-full rounded-lg border border-black/20 bg-pink-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-pink-400">
                    Mesaj Gonder
                  </button>
                </Link>
              ) : null}

              {msg ? <p className="mt-3 text-xs text-red-600">{msg}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl space-y-8">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Son baktiklarin</h2>
            <button
              className="rounded-lg border px-3 py-1 text-xs"
              onClick={clearRecentlyViewed}
              type="button"
            >
              Temizle
            </button>
          </div>
          {recentProducts.length === 0 ? (
            <p className="mt-2 text-sm opacity-70">Henuz baska bir urun incelemedin.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentProducts.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${encodeURIComponent(p.id)}`}
                  className="rounded-xl border p-3 transition hover:bg-black/5"
                >
                  <div className="relative h-28 w-full overflow-hidden rounded-lg bg-black/5">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 50vw, 240px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs">Gorsel yok</div>
                    )}
                  </div>
                  <div className="mt-2 text-sm font-semibold line-clamp-1">{p.title}</div>
                  <div className="text-xs opacity-70">{p.daily_price} TL / gun</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Bunlar ilgini cekebilir</h2>
          {recommendedProducts.length === 0 ? (
            <p className="mt-2 text-sm opacity-70">Daha fazla urun inceledikce oneriler burada gorunecek.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recommendedProducts.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${encodeURIComponent(p.id)}`}
                  className="rounded-xl border p-3 transition hover:bg-black/5"
                >
                  <div className="relative h-28 w-full overflow-hidden rounded-lg bg-black/5">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 50vw, 240px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs">Gorsel yok</div>
                    )}
                  </div>
                  <div className="mt-2 text-sm font-semibold line-clamp-1">{p.title}</div>
                  <div className="text-xs opacity-70">{p.daily_price} TL / gun</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
