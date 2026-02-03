"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import ProductCard from "./components/ProductCard"
import { useAuth } from "./context/AuthContext"
import { TAG_OPTIONS } from "./lib/tags"

type ProductListItem = {
  id: string
  title: string
  daily_price: number
  created_at?: string | null
  image_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  tags?: string[] | null
  features?: string[] | null
  owner_email?: string | null
  owner_username?: string | null
  view_count?: number | null
}

export default function HomePage() {
  const { userEmail } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [appliedTags, setAppliedTags] = useState<string[]>([])
  const [searchDraft, setSearchDraft] = useState("")
  const [searchApplied, setSearchApplied] = useState("")
  const popularScrollRef = useRef<HTMLDivElement | null>(null)
  const popularAnimRef = useRef<number | null>(null)

  function normalizeText(value: string) {
    return value
      .toLowerCase()
      .replaceAll("ı", "i")
      .replaceAll("ğ", "g")
      .replaceAll("ü", "u")
      .replaceAll("ş", "s")
      .replaceAll("ö", "o")
      .replaceAll("ç", "c")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  function levenshtein(a: string, b: string) {
    const alen = a.length
    const blen = b.length
    if (alen === 0) return blen
    if (blen === 0) return alen

    const dp = Array.from({ length: alen + 1 }, () => Array(blen + 1).fill(0))
    for (let i = 0; i <= alen; i++) dp[i][0] = i
    for (let j = 0; j <= blen; j++) dp[0][j] = j

    for (let i = 1; i <= alen; i++) {
      for (let j = 1; j <= blen; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        )
      }
    }
    return dp[alen][blen]
  }

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch("/api/products", {
          cache: "no-store",
          signal: controller.signal,
        })

        const json = (await res.json().catch(() => ({}))) as {
          products?: ProductListItem[]
          error?: string
        }

        if (!mounted) return
        if (!res.ok) {
          setError(json.error || "Ilanlar alinamadi.")
          setProducts([])
          return
        }

        setProducts(Array.isArray(json.products) ? json.products : [])
      } catch {
        if (!mounted) return
        setError("Baglanti hatasi.")
        setProducts([])
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }

    load()

    return () => {
      mounted = false
      controller.abort()
    }
  }, [])

  const visibleProducts = useMemo(() => {
    if (!userEmail) return products
    return products.filter(
      (p) => !p.owner_email || String(p.owner_email).toLowerCase() !== userEmail.toLowerCase()
    )
  }, [products, userEmail])

  useEffect(() => {
    setDraftTags((prev) => prev.filter((t) => TAG_OPTIONS.includes(t)))
    setAppliedTags((prev) => prev.filter((t) => TAG_OPTIONS.includes(t)))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const q = String(new URLSearchParams(window.location.search).get("q") || "").trim()
    setSearchDraft(q)
    setSearchApplied(q)
  }, [])

  const filteredProducts = useMemo(() => {
    const base = appliedTags.length === 0
      ? visibleProducts
      : visibleProducts.filter((p) => {
      const tags = (Array.isArray(p.tags) ? p.tags : [])
        .map((t) => String(t || "").trim().toLowerCase())
      return appliedTags.every((tag) => tags.includes(tag))
    })
    const q = normalizeText(searchApplied)
    if (!q) return base

    const qTokens = q.split(/\s+/).filter(Boolean)
    const scored = base
      .map((p) => {
        const fields = [
          String(p.title || ""),
          String(p.description || ""),
          ...(Array.isArray(p.tags) ? p.tags.map((t) => String(t || "")) : []),
          ...(Array.isArray(p.features) ? p.features.map((f) => String(f || "")) : []),
        ]
        const hay = normalizeText(fields.join(" "))
        const hayTokens = hay.split(/[^a-z0-9]+/i).filter(Boolean)

        let score = 0
        if (hay.includes(q)) score += 8
        for (const token of qTokens) {
          if (hay.includes(token)) score += 3
          if (hayTokens.some((t) => t.startsWith(token))) score += 2
          const bestDistance = hayTokens.reduce((min, t) => Math.min(min, levenshtein(token, t)), 99)
          if (bestDistance === 1) score += 2
          else if (bestDistance === 2) score += 1
        }
        const overlap = qTokens.filter((token) => hayTokens.includes(token)).length
        score += overlap * 2

        return { p, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map((x) => x.p)
  }, [appliedTags, searchApplied, visibleProducts])

  const popularProducts = useMemo(() => {
    return [...visibleProducts]
      .sort((a, b) => {
        const av = Number(a.view_count || 0)
        const bv = Number(b.view_count || 0)
        if (av !== bv) return bv - av
        return String(b.created_at || "").localeCompare(String(a.created_at || ""))
      })
      .slice(0, 4)
  }, [visibleProducts])

  function scrollPopular(direction: "left" | "right") {
    if (!popularScrollRef.current) return
    if (popularAnimRef.current) {
      cancelAnimationFrame(popularAnimRef.current)
      popularAnimRef.current = null
    }

    const container = popularScrollRef.current
    const amount = 540
    const start = container.scrollLeft
    const delta = direction === "left" ? -amount : amount
    const max = container.scrollWidth - container.clientWidth
    const target = Math.max(0, Math.min(max, start + delta))
    const duration = 520
    const startTime = performance.now()

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const eased = easeInOutCubic(t)
      container.scrollLeft = start + (target - start) * eased
      if (t < 1) {
        popularAnimRef.current = requestAnimationFrame(tick)
      } else {
        popularAnimRef.current = null
      }
    }

    popularAnimRef.current = requestAnimationFrame(tick)
  }

  function toggleDraftTag(tag: string) {
    setDraftTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
      <div className="mx-auto max-w-[1760px]">
        <h1 className="mb-2 text-4xl font-bold">Kiralanabilir Urunler</h1>
        <p className="mb-6 text-gray-700">Diger kullanicilarin yukledigi ilanlari inceleyin.</p>

        {loading ? <p className="text-gray-700">Yukleniyor...</p> : null}
        {error ? <p className="text-red-700">{error}</p> : null}

        {!loading && !error && popularProducts.length > 0 ? (
          <section className="mb-8 rounded-3xl border border-white/50 bg-gradient-to-r from-rose-100/90 via-pink-100/90 to-rose-50/90 p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold tracking-tight">Populer Ilanlar</h2>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => scrollPopular("left")}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/95 px-4 py-3 text-xl font-bold shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-pink-50"
                aria-label="Populer ilanlari sola kaydir"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => scrollPopular("right")}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/95 px-4 py-3 text-xl font-bold shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-pink-50"
                aria-label="Populer ilanlari saga kaydir"
              >
                ›
              </button>

              <div
                ref={popularScrollRef}
                className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-12 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {popularProducts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/product/${encodeURIComponent(p.id)}`}
                    className="group min-w-[520px] snap-start overflow-hidden rounded-3xl border border-white/70 bg-white shadow-md transition hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    <div className="relative h-[280px] w-full bg-black/5">
                      <Image
                        src={
                          (Array.isArray(p.image_urls)
                            ? p.image_urls.find((u) => String(u || "").trim().length > 0)
                            : null) ||
                          p.image_url ||
                          "/products/placeholder.jpg"
                        }
                        alt={p.title}
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.04]"
                        sizes="520px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3 text-white">
                        <span className="mb-2 inline-flex rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                          One Cikan Ilan
                        </span>
                        <p className="line-clamp-1 text-2xl font-extrabold tracking-tight">{p.title}</p>
                        <p className="text-sm opacity-95">Populer kategorilerde en cok ilgi goren urunler</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr]">
          <aside className="h-fit rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="mb-4 text-2xl font-bold tracking-tight">Filtreler</p>
            <div className="border-t border-black/10 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-lg font-semibold">Kategori</p>
                <span className="text-xs text-black/50">v</span>
              </div>

              <div className="max-h-80 space-y-2 overflow-auto pr-1">
                {TAG_OPTIONS.map((tag) => (
                <label
                  key={tag}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draftTags.includes(tag)}
                    onChange={() => toggleDraftTag(tag)}
                    className="h-4 w-4 rounded border-black/30"
                  />
                  <span>{tag}</span>
                </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-pink-300 px-4 py-2 text-sm font-semibold text-black hover:bg-pink-400"
              onClick={() => {
                setAppliedTags(draftTags)
                setSearchApplied(searchDraft.trim())
              }}
            >
              Filtrele
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl border px-4 py-2 text-sm"
              onClick={() => {
                setDraftTags([])
                setAppliedTags([])
              }}
            >
              Temizle
            </button>
          </aside>

          <section>
            {!loading && !error && filteredProducts.length === 0 ? (
              <p className="mb-4 text-gray-700">Secilen etiketlere gore urun bulunamadi.</p>
            ) : null}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} variant="home" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
