"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/app/lib/supabaseClient"
import { useAuth } from "@/app/context/AuthContext"
import { useRouter } from "next/navigation"
import { TAG_OPTIONS } from "@/app/lib/tags"

type OwnerProduct = {
  id: string
  title: string
  daily_price: number
  created_at?: string
}

export default function OwnerProductsClient() {
  const router = useRouter()
  const { isLoggedIn, userEmail } = useAuth()

  const [title, setTitle] = useState("")
  const [dailyPrice, setDailyPrice] = useState<number>(150)
  const [description, setDescription] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>(["bebek", "ev"])
  const [featuresText, setFeaturesText] = useState("Temiz, Saglam")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")

  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [myProducts, setMyProducts] = useState<OwnerProduct[]>([])
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!isLoggedIn) router.push("/login?next=/owner-products")
  }, [isLoggedIn, router])

  useEffect(() => {
    if (!file) {
      setPreviewUrl("")
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function uploadImage(f: File) {
    const ext = f.name.split(".").pop() || "jpg"
    const path = `products/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

    const { error } = await supabase.storage.from("product-images").upload(path, f, {
      cacheControl: "3600",
      upsert: false,
    })
    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from("product-images").getPublicUrl(path)
    return data.publicUrl
  }

  async function handleCreate() {
    setErr("")
    setMsg("")

    if (!title.trim() || !description.trim()) {
      setErr("Baslik ve aciklama zorunlu.")
      return
    }
    if (!file) {
      setErr("Lutfen bir gorsel sec.")
      return
    }

    setLoading(true)

    try {
      const imageUrl = await uploadImage(file)

      const token = await getToken()
      if (!token) throw new Error("Token yok. Tekrar giris yap.")

      const tags = Array.from(new Set(selectedTags))

      const features = featuresText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch("/api/owner/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          daily_price: Number(dailyPrice),
          image_url: imageUrl,
          description: description.trim(),
          tags,
          features,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Urun eklenemedi.")

      setMsg("Urun eklendi. Ana sayfada gorunmeli.")
      setTitle("")
      setDescription("")
      setSelectedTags(["bebek", "ev"])
      setFeaturesText("Temiz, Saglam")
      setFile(null)
      setPreviewUrl("")
      await loadMyProducts()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Hata olustu.")
    } finally {
      setLoading(false)
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  async function loadMyProducts() {
    setListLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch("/api/owner/products", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Ilanlar alinamadi.")
      setMyProducts(Array.isArray(json.products) ? json.products : [])
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ilanlar alinamadi.")
    } finally {
      setListLoading(false)
    }
  }

  async function handleDelete(productId: string) {
    const ok = window.confirm("Bu ilani silmek istediginize emin misiniz?")
    if (!ok) return

    setErr("")
    setMsg("")
    setDeletingId(productId)
    try {
      const token = await getToken()
      if (!token) throw new Error("Token yok. Tekrar giris yap.")

      const res = await fetch(`/api/owner/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Ilan silinemedi.")

      setMyProducts((prev) => prev.filter((p) => p.id !== productId))
      setMsg("Ilan silindi.")
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ilan silinemedi.")
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return
    loadMyProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn])

  return (
    <div className="space-y-6">
      <div className="card p-8">
        <h1 className="text-3xl font-extrabold">Urun Ekle</h1>
        <p className="text-muted mt-2">
          Giris yapan: <b>{userEmail}</b>
        </p>
        <p className="mt-2 text-sm">Fotograf ekleme alani asagida Gorsel basligi altindadir.</p>
      </div>

      <div className="card p-8 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">Urun Basligi</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Orn: Park Yatak" />
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Gunluk Fiyat (TL)</p>
            <input
              type="number"
              value={dailyPrice}
              onChange={(e) => setDailyPrice(Number(e.target.value))}
              placeholder="150"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold">Aciklama</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Urun aciklamasi..."
            className="min-h-[120px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">Etiketler</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedTags.includes(tag)
                      ? "border-pink-400 bg-pink-300 font-semibold text-black"
                      : "border-black/20 bg-white"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Sadece listeden etiket secilebilir.</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Ozellikler (virgulle)</p>
            <input
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              placeholder="Temiz, Saglam, Katlanir"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold">Gorsel (fotograf ekle)</p>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="text-muted mt-2 text-xs">Giris yapan kullanici urun gorseli yukleyebilir.</p>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Secilen urun gorseli"
              className="mt-3 h-44 w-full max-w-sm rounded-xl border object-cover"
            />
          ) : null}
        </div>

        {err && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/15 px-4 py-3 text-sm text-green-700">
            {msg}
          </div>
        )}

        <button className="btn-primary w-full" onClick={handleCreate} disabled={loading}>
          {loading ? "Ekleniyor..." : "Urunu Ekle"}
        </button>

        <button className="btn-ghost w-full" onClick={() => router.push("/")}>
          Ana sayfaya don
        </button>
      </div>

      <div className="card p-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold">Ilanlarim</h2>
          <button className="btn-ghost" onClick={loadMyProducts} disabled={listLoading}>
            {listLoading ? "Yukleniyor..." : "Yenile"}
          </button>
        </div>

        {myProducts.length === 0 ? (
          <p className="text-sm text-muted">Henuz ilan eklemediniz.</p>
        ) : (
          <div className="space-y-3">
            {myProducts.map((p) => (
              <div key={p.id} className="rounded-xl border bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <div className="text-sm opacity-80">{p.daily_price} TL / gun</div>
                  </div>

                  <button
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                    onClick={() => handleDelete(p.id)}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? "Siliniyor..." : "Ilani Sil"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
