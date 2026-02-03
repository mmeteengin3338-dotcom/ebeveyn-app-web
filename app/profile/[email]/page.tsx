"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import Image from "next/image"
import ProductCard from "@/app/components/ProductCard"

type ProductListItem = {
  id: string
  title: string
  daily_price: number
  image_url?: string | null
  description?: string | null
  tags?: string[] | null
  features?: string[] | null
  owner_email?: string | null
  owner_username?: string | null
  owner_avatar_url?: string | null
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function PublicProfilePage() {
  const routeParams = useParams<{ email?: string | string[] }>()
  const handle = useMemo(() => {
    const rawParam = routeParams?.email
    const raw = Array.isArray(rawParam) ? rawParam[0] : rawParam
    if (!raw) return ""

    // Handle both encoded and double-encoded route params.
    let decoded = String(raw)
    try {
      decoded = decodeURIComponent(decoded)
      if (/%[0-9a-f]{2}/i.test(decoded)) decoded = decodeURIComponent(decoded)
    } catch {
      // keep raw value
    }
    return decoded.trim().toLowerCase()
  }, [routeParams?.email])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [profileUsername, setProfileUsername] = useState("")
  const [profileEmail, setProfileEmail] = useState("")
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("")
  const [profileCreatedAt, setProfileCreatedAt] = useState("")

  function getMemberBadge(createdAt: string) {
    const createdMs = Date.parse(createdAt)
    if (!Number.isFinite(createdMs)) return null
    const diffDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24)
    if (diffDays >= 0 && diffDays <= 31) return "Yeni Uye"
    if (diffDays > 31 && diffDays <= 183) return "Tecrubeli Uye"
    return null
  }

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError("")

      try {
        const profileRes = await fetch(
          `/api/profiles?${isEmail(handle) ? "email" : "username"}=${encodeURIComponent(handle)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        )
        const profileJson = (await profileRes.json().catch(() => ({}))) as {
          profile?: {
            username?: string | null
            email?: string | null
            avatar_url?: string | null
            created_at?: string | null
          }
        }
        if (!mounted) return
        if (!profileRes.ok || !profileJson.profile?.email) {
          setError("Profil bulunamadi.")
          setProducts([])
          return
        }

        const resolvedEmail = String(profileJson.profile.email || "").trim().toLowerCase()
        const resolvedUsername = String(profileJson.profile.username || "").trim()
        const resolvedAvatarUrl = String(profileJson.profile.avatar_url || "").trim()
        const resolvedCreatedAt = String(profileJson.profile.created_at || "").trim()
        setProfileEmail(resolvedEmail)
        setProfileUsername(resolvedUsername)
        setProfileAvatarUrl(resolvedAvatarUrl)
        setProfileCreatedAt(resolvedCreatedAt)

        const res = await fetch(`/api/products?owner_email=${encodeURIComponent(resolvedEmail)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = (await res.json().catch(() => ({}))) as {
          products?: ProductListItem[]
          error?: string
        }
        if (!mounted) return
        if (!res.ok) {
          setError(json.error || "Profil ilanlari alinamadi.")
          setProducts([])
          return
        }
        setProducts(Array.isArray(json.products) ? json.products : [])
      } catch {
        if (!mounted) return
        setError("Baglanti hatasi.")
        setProducts([])
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
      controller.abort()
    }
  }, [handle])

  return (
    <main className="container-app space-y-4">
      <div className="card p-8">
        <h1 className="text-3xl font-extrabold">Profil</h1>
        <div className="mt-3 mb-2 relative h-16 w-16 overflow-hidden rounded-full border bg-black/5">
          {profileAvatarUrl ? (
            <Image src={profileAvatarUrl} alt={profileUsername || "Profil"} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold">
              {(profileUsername || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-muted">Kullanici Adi</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-semibold">{profileUsername || "-"}</p>
          {getMemberBadge(profileCreatedAt) ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {getMemberBadge(profileCreatedAt)}
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          {profileEmail ? (
            <Link href={`/chats?peer=${encodeURIComponent(profileEmail)}`} className="btn-primary inline-flex">
              Mesaj Gonder
            </Link>
          ) : null}
        </div>
      </div>

      <div className="card p-8">
        <h2 className="text-2xl font-extrabold">Verdigi Ilanlar</h2>
        {loading ? <p className="mt-3 text-sm text-muted">Yukleniyor...</p> : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && products.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Bu kullanicinin ilani bulunmuyor.</p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </main>
  )
}
