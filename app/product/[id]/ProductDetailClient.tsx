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

type ProductComment = {
  id: string
  product_id: string
  parent_comment_id?: string | null
  user_id: string
  user_email: string
  comment_text: string
  created_at: string
  username?: string | null
  avatar_url?: string | null
}

const RECENTLY_VIEWED_KEY = "recently_viewed_product_ids"
const RECENTLY_VIEWED_LIMIT = 8

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function formatCommentDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function getCommentAuthor(comment: ProductComment) {
  const username = String(comment.username || "").trim()
  if (username) return username

  const email = String(comment.user_email || "").trim()
  if (!email) return "Kullanici"
  return email.split("@")[0] || email
}

export default function ProductDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [rentedProductIds, setRentedProductIds] = useState<string[]>([])
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const galleryRef = useRef<HTMLDivElement | null>(null)

  const [comments, setComments] = useState<ProductComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [commentActionLoadingId, setCommentActionLoadingId] = useState<string | null>(null)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replySubmittingId, setReplySubmittingId] = useState<string | null>(null)

  const safeId = useMemo(() => String(id ?? "").trim(), [id])
  const chatHref = useMemo(() => {
    const owner = String(product?.owner_email || "").trim().toLowerCase()
    if (!owner) return ""
    return "/chats?product=" + encodeURIComponent(safeId) + "&peer=" + encodeURIComponent(owner)
  }, [product?.owner_email, safeId])

  const canMessageOwner = useMemo(() => {
    const owner = String(product?.owner_email || "").trim().toLowerCase()
    if (!owner || !currentUserEmail) return false
    return owner !== currentUserEmail.toLowerCase()
  }, [currentUserEmail, product?.owner_email])

  const topLevelComments = useMemo(() => {
    const idSet = new Set(comments.map((comment) => comment.id))
    return comments
      .filter((comment) => {
        const parentId = String(comment.parent_comment_id || "").trim()
        return !parentId || !idSet.has(parentId)
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  }, [comments])

  const repliesByParent = useMemo(() => {
    const map = new Map<string, ProductComment[]>()
    const sorted = [...comments].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    for (const comment of sorted) {
      const parentId = String(comment.parent_comment_id || "").trim()
      if (!parentId) continue
      const list = map.get(parentId) || []
      list.push(comment)
      map.set(parentId, list)
    }
    return map
  }, [comments])

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
        const res = await fetch("/api/products/" + encodeURIComponent(safeId), {
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
        const token = session?.access_token ?? null
        const email = session?.user?.email ?? null

        if (!alive) return
        setCurrentUserEmail(email)
        setCurrentUserId(session?.user?.id ?? null)
        setAuthToken(token)

        if (!token) return

        const res = await fetch("/api/rentals", {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization: "Bearer " + token,
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
    let alive = true
    const controller = new AbortController()

    async function loadComments() {
      if (!safeId || !isUuid(safeId)) {
        setComments([])
        setCommentsLoading(false)
        return
      }

      setCommentsLoading(true)
      try {
        const res = await fetch("/api/products/" + encodeURIComponent(safeId) + "/comments", {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = (await res.json().catch(() => ({}))) as {
          comments?: ProductComment[]
          error?: string
        }

        if (!alive) return
        if (!res.ok) {
          setCommentError(json.error || "Yorumlar yuklenemedi.")
          return
        }

        setCommentError(null)
        setComments(Array.isArray(json.comments) ? json.comments : [])
      } catch (e: unknown) {
        if (!alive) return
        if (e instanceof Error && e.name === "AbortError") return
        setCommentError("Yorumlar yuklenemedi.")
      } finally {
        if (!alive) return
        setCommentsLoading(false)
      }
    }

    loadComments()

    return () => {
      alive = false
      controller.abort()
    }
  }, [safeId])

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
    const key = "view_ping:" + safeId
    if (sessionStorage.getItem(key) === "1") return

    sessionStorage.setItem(key, "1")
    fetch("/api/products/" + encodeURIComponent(safeId), {
      method: "POST",
      cache: "no-store",
    }).catch(() => {
      // best effort only
    })
  }, [safeId])

  function clearRecentlyViewed() {
    if (!product?.id) return
    localStorage.removeItem(RECENTLY_VIEWED_KEY)
    setRecentIds([product.id])
  }

  function isOwnComment(comment: ProductComment) {
    return Boolean(currentUserId && comment.user_id === currentUserId)
  }

  function startReply(comment: ProductComment) {
    setCommentError(null)
    setCommentSuccess(null)
    setReplyingToId(comment.id)
    setReplyText("")
  }

  function cancelReply() {
    setReplyingToId(null)
    setReplyText("")
  }

  function startEditComment(comment: ProductComment) {
    setCommentError(null)
    setCommentSuccess(null)
    setReplyingToId(null)
    setReplyText("")
    setEditingCommentId(comment.id)
    setEditingText(comment.comment_text)
  }

  function cancelEditComment() {
    setEditingCommentId(null)
    setEditingText("")
  }

  async function saveCommentEdit(comment: ProductComment) {
    const text = editingText.trim()
    if (text.length < 2 || text.length > 500) {
      setCommentError("Yorum 2-500 karakter olmali.")
      return
    }

    let token = authToken
    if (!token) {
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token ?? null
      setAuthToken(token)
    }

    if (!token) {
      router.push("/login?next=/product/" + encodeURIComponent(safeId))
      return
    }

    setCommentActionLoadingId(comment.id)
    setCommentError(null)
    setCommentSuccess(null)

    try {
      const res = await fetch("/api/products/" + encodeURIComponent(safeId) + "/comments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          comment_id: comment.id,
          comment_text: text,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        comment?: ProductComment
        error?: string
      }

      if (!res.ok) {
        setCommentError(json.error || "Yorum guncellenemedi.")
        return
      }

      const next = json.comment
        ? (json.comment as ProductComment)
        : ({ ...comment, comment_text: text } as ProductComment)

      setComments((prev) => prev.map((item) => (item.id === comment.id ? next : item)))
      setCommentSuccess("Yorum guncellendi.")
      setEditingCommentId(null)
      setEditingText("")
    } catch {
      setCommentError("Baglanti hatasi.")
    } finally {
      setCommentActionLoadingId(null)
    }
  }

  async function deleteComment(comment: ProductComment) {
    let token = authToken
    if (!token) {
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token ?? null
      setAuthToken(token)
    }

    if (!token) {
      router.push("/login?next=/product/" + encodeURIComponent(safeId))
      return
    }

    const confirmed = window.confirm("Bu yorumu silmek istiyor musun?")
    if (!confirmed) return

    setCommentActionLoadingId(comment.id)
    setCommentError(null)
    setCommentSuccess(null)

    try {
      const res = await fetch("/api/products/" + encodeURIComponent(safeId) + "/comments", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          comment_id: comment.id,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        error?: string
      }

      if (!res.ok) {
        setCommentError(json.error || "Yorum silinemedi.")
        return
      }

      setComments((prev) => prev.filter((item) => item.id !== comment.id))
      setCommentSuccess("Yorum silindi.")
      if (editingCommentId === comment.id) {
        setEditingCommentId(null)
        setEditingText("")
      }
      if (replyingToId === comment.id) {
        setReplyingToId(null)
        setReplyText("")
      }
    } catch {
      setCommentError("Baglanti hatasi.")
    } finally {
      setCommentActionLoadingId(null)
    }
  }

  async function submitReply(parentComment: ProductComment) {
    setCommentError(null)
    setCommentSuccess(null)

    const text = replyText.trim()
    if (text.length < 2 || text.length > 500) {
      setCommentError("Yanit 2-500 karakter olmali.")
      return
    }

    let token = authToken
    if (!token) {
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token ?? null
      setAuthToken(token)
    }

    if (!token) {
      router.push("/login?next=/product/" + encodeURIComponent(safeId))
      return
    }

    setReplySubmittingId(parentComment.id)
    try {
      const res = await fetch("/api/products/" + encodeURIComponent(safeId) + "/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          comment_text: text,
          parent_comment_id: parentComment.id,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        comment?: ProductComment
        error?: string
      }

      if (!res.ok) {
        setCommentError(json.error || "Yanit gonderilemedi.")
        return
      }

      if (json.comment) {
        setComments((prev) => [...prev, json.comment as ProductComment])
      }
      setReplyText("")
      setReplyingToId(null)
      setCommentSuccess("Yanit eklendi.")
    } catch {
      setCommentError("Baglanti hatasi.")
    } finally {
      setReplySubmittingId(null)
    }
  }

  async function submitComment() {
    setCommentError(null)
    setCommentSuccess(null)

    const text = commentText.trim()
    if (text.length < 2) {
      setCommentError("Yorum en az 2 karakter olmali.")
      return
    }
    if (text.length > 500) {
      setCommentError("Yorum en fazla 500 karakter olmali.")
      return
    }
    if (!safeId || !isUuid(safeId)) {
      setCommentError("Gecersiz urun id.")
      return
    }

    let token = authToken
    if (!token) {
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token ?? null
      setAuthToken(token)
    }

    if (!token) {
      router.push("/login?next=/product/" + encodeURIComponent(safeId))
      return
    }

    setCommentSubmitting(true)
    try {
      const res = await fetch("/api/products/" + encodeURIComponent(safeId) + "/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ comment_text: text }),
      })

      const json = (await res.json().catch(() => ({}))) as {
        comment?: ProductComment
        error?: string
      }

      if (!res.ok) {
        setCommentError(json.error || "Yorum gonderilemedi.")
        return
      }

      if (json.comment) {
        setComments((prev) => [json.comment as ProductComment, ...prev])
      }
      setCommentText("")
      setCommentSuccess("Yorum basariyla eklendi.")
    } catch {
      setCommentError("Baglanti hatasi.")
    } finally {
      setCommentSubmitting(false)
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
              <div key={url + "-" + idx} className="relative h-80 min-w-full snap-start bg-gradient-to-br from-pink-50 to-rose-50">
                <Image
                  src={url}
                  alt={product.title + " " + (idx + 1)}
                  fill
                  className="object-contain p-2"
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
                  aria-label={"Gorsel " + (idx + 1)}
                  onClick={() => {
                    const el = galleryRef.current
                    if (!el) return
                    el.scrollTo({ left: el.clientWidth * idx, behavior: "smooth" })
                  }}
                  className={"h-2.5 w-2.5 rounded-full transition " + (idx === activeImageIndex ? "bg-white" : "bg-white/45")}
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


              <button
                className="mt-3 w-full rounded-lg border px-4 py-2 text-sm"
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
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl space-y-8">
        <section className="rounded-3xl border border-pink-200/70 bg-gradient-to-br from-white via-pink-50/35 to-rose-50/60 p-6 shadow-[0_28px_90px_-42px_rgba(236,72,153,0.65)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Yorumlar ({comments.length})</h2>
            <span className="rounded-full border border-pink-200 bg-white/85 px-3 py-1 text-xs font-medium text-pink-700">
              Topluluk geri bildirimi
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-pink-200/70 bg-white/85 p-4 backdrop-blur">
            <label htmlFor="comment-input" className="mb-2 block text-sm font-medium text-slate-700">
              Yorum yaz
            </label>
            <textarea
              id="comment-input"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Bu urun hakkindaki yorumunuzu yazin"
              className="w-full resize-none rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm"
            />
            <div className="mt-1 text-right text-xs text-slate-500">{commentText.length}/500</div>

            <button
              className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
              onClick={submitComment}
              disabled={commentSubmitting}
              type="button"
            >
              {commentSubmitting ? "Gonderiliyor..." : "Yorum gonder"}
            </button>

            {commentError ? <p className="mt-2 text-xs text-red-600">{commentError}</p> : null}
            {commentSuccess ? <p className="mt-2 text-xs text-emerald-600">{commentSuccess}</p> : null}
          </div>
          {commentsLoading ? (
            <p className="mt-4 text-sm text-slate-600">Yorumlar yukleniyor...</p>
          ) : topLevelComments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">Bu urune henuz yorum yapilmadi.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {topLevelComments.map((comment) => {
                const author = getCommentAuthor(comment)
                const initial = author.charAt(0).toUpperCase() || "U"
                const avatar = String(comment.avatar_url || "").trim()
                const ownComment = isOwnComment(comment)
                const replies = repliesByParent.get(comment.id) || []

                return (
                  <div key={comment.id} className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
                    <div className="flex items-center gap-3">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={author}
                          className="h-9 w-9 rounded-full border object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-pink-100 text-xs font-semibold">
                          {initial}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold">{author}</div>
                        <div className="text-xs opacity-60">{formatCommentDate(comment.created_at)}</div>
                      </div>
                    </div>

                    {editingCommentId === comment.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={500}
                          rows={3}
                          className="w-full resize-none rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="mt-1 text-right text-xs text-slate-500">{editingText.length}/500</div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.comment_text}</p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {editingCommentId === comment.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveCommentEdit(comment)}
                            disabled={commentActionLoadingId === comment.id}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >
                            {commentActionLoadingId === comment.id ? "Kaydediliyor..." : "Kaydet"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditComment}
                            disabled={commentActionLoadingId === comment.id}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                          >
                            Vazgec
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => (replyingToId === comment.id ? cancelReply() : startReply(comment))}
                            disabled={replySubmittingId === comment.id}
                            className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-700"
                          >
                            {replyingToId === comment.id ? "Vazgec" : "Cevapla"}
                          </button>

                          {ownComment ? (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditComment(comment)}
                                disabled={commentActionLoadingId === comment.id}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                              >
                                Duzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteComment(comment)}
                                disabled={commentActionLoadingId === comment.id}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
                              >
                                {commentActionLoadingId === comment.id ? "Siliniyor..." : "Sil"}
                              </button>
                            </>
                          ) : null}
                        </>
                      )}
                    </div>

                    {replyingToId === comment.id ? (
                      <div className="mt-3 rounded-xl border border-pink-200/70 bg-pink-50/70 p-3">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder={author + " kullanicisina cevap yaz"}
                          className="w-full resize-none rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="mt-1 text-right text-xs text-slate-500">{replyText.length}/500</div>
                        <button
                          type="button"
                          onClick={() => submitReply(comment)}
                          disabled={replySubmittingId === comment.id}
                          className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {replySubmittingId === comment.id ? "Gonderiliyor..." : "Cevabi gonder"}
                        </button>
                      </div>
                    ) : null}

                    {replies.length > 0 ? (
                      <div className="mt-4 space-y-3 border-l-2 border-pink-200/80 pl-3">
                        {replies.map((reply) => {
                          const replyAuthor = getCommentAuthor(reply)
                          const replyInitial = replyAuthor.charAt(0).toUpperCase() || "U"
                          const replyAvatar = String(reply.avatar_url || "").trim()
                          const ownReply = isOwnComment(reply)

                          return (
                            <div key={reply.id} className="rounded-xl border border-pink-200/60 bg-white p-3">
                              <div className="flex items-center gap-2">
                                {replyAvatar ? (
                                  <img
                                    src={replyAvatar}
                                    alt={replyAuthor}
                                    className="h-8 w-8 rounded-full border border-pink-200 object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-pink-200 bg-pink-100 text-[11px] font-semibold text-pink-700">
                                    {replyInitial}
                                  </div>
                                )}
                                <div>
                                  <div className="text-xs font-semibold text-slate-900">{replyAuthor}</div>
                                  <div className="text-[11px] text-slate-500">{formatCommentDate(reply.created_at)}</div>
                                </div>
                              </div>

                              {editingCommentId === reply.id ? (
                                <div className="mt-2">
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    className="w-full resize-none rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <div className="mt-1 text-right text-xs text-slate-500">{editingText.length}/500</div>
                                </div>
                              ) : (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{reply.comment_text}</p>
                              )}

                              <div className="mt-2 flex flex-wrap gap-2">
                                {editingCommentId === reply.id ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveCommentEdit(reply)}
                                      disabled={commentActionLoadingId === reply.id}
                                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                    >
                                      {commentActionLoadingId === reply.id ? "Kaydediliyor..." : "Kaydet"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditComment}
                                      disabled={commentActionLoadingId === reply.id}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                                    >
                                      Vazgec
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => (replyingToId === reply.id ? cancelReply() : startReply(reply))}
                                      disabled={replySubmittingId === reply.id}
                                      className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-700"
                                    >
                                      {replyingToId === reply.id ? "Vazgec" : "Cevapla"}
                                    </button>

                                    {ownReply ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => startEditComment(reply)}
                                          disabled={commentActionLoadingId === reply.id}
                                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                                        >
                                          Duzenle
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteComment(reply)}
                                          disabled={commentActionLoadingId === reply.id}
                                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
                                        >
                                          {commentActionLoadingId === reply.id ? "Siliniyor..." : "Sil"}
                                        </button>
                                      </>
                                    ) : null}
                                  </>
                                )}
                              </div>

                              {replyingToId === reply.id ? (
                                <div className="mt-2 rounded-lg border border-pink-200/70 bg-pink-50/70 p-3">
                                  <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    placeholder={replyAuthor + " kullanicisina cevap yaz"}
                                    className="w-full resize-none rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm"
                                  />
                                  <div className="mt-1 text-right text-xs text-slate-500">{replyText.length}/500</div>
                                  <button
                                    type="button"
                                    onClick={() => submitReply(reply)}
                                    disabled={replySubmittingId === reply.id}
                                    className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                                  >
                                    {replySubmittingId === reply.id ? "Gonderiliyor..." : "Cevabi gonder"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>

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
                  href={"/product/" + encodeURIComponent(p.id)}
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
                  href={"/product/" + encodeURIComponent(p.id)}
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









