"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { supabase } from "@/app/lib/supabaseClient"
import { useAuth } from "@/app/context/AuthContext"
import ProductCard from "@/app/components/ProductCard"

type OwnerProduct = {
  id: string
  title: string
  daily_price: number
  image_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  tags?: string[] | null
  owner_email?: string | null
  owner_username?: string | null
  owner_avatar_url?: string | null
  created_at?: string
}

export default function ProfilePage() {
  const router = useRouter()
  const { isLoggedIn, userEmail, signOut } = useAuth()
  const [username, setUsername] = useState("")
  const [memberSince, setMemberSince] = useState("")
  const [usernameInput, setUsernameInput] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameMsg, setUsernameMsg] = useState("")
  const [usernameErr, setUsernameErr] = useState("")
  const [listLoading, setListLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [myProducts, setMyProducts] = useState<OwnerProduct[]>([])
  const [err, setErr] = useState("")
  const [msg, setMsg] = useState("")

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }, [])

  const loadMyProducts = useCallback(async () => {
    setListLoading(true)
    setErr("")
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch("/api/owner/products", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Ilanlar alinamadi.")
      setMyProducts(Array.isArray(json.products) ? json.products : [])
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ilanlar alinamadi.")
    } finally {
      setListLoading(false)
    }
  }, [getToken])

  const loadMyProfile = useCallback(async () => {
    if (!userEmail) return
    try {
      const res = await fetch(`/api/profiles?email=${encodeURIComponent(userEmail)}`, {
        cache: "no-store",
      })
      const json = (await res.json().catch(() => ({}))) as {
        profile?: { username?: string | null; avatar_url?: string | null; created_at?: string | null }
      }
      if (!res.ok) return
      const nextUsername = String(json.profile?.username || "").trim()
      const nextAvatarUrl = String(json.profile?.avatar_url || "").trim()
      const nextMemberSince = String(json.profile?.created_at || "").trim()
      setUsername(nextUsername)
      setAvatarUrl(nextAvatarUrl)
      setMemberSince(nextMemberSince)
      if (!nextUsername) setUsernameInput(nextUsername)
    } catch {
      // no-op
    }
  }, [userEmail])

  function normalizeUsername(value: string) {
    return value.trim().toLowerCase()
  }

  function isValidUsername(value: string) {
    return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value))
  }

  function getMemberBadge(createdAt: string) {
    const createdMs = Date.parse(createdAt)
    if (!Number.isFinite(createdMs)) return null
    const diffDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24)
    if (diffDays >= 0 && diffDays <= 31) return "Yeni Uye"
    if (diffDays > 31 && diffDays <= 183) return "Tecrubeli Uye"
    return null
  }

  async function saveUsername() {
    setUsernameMsg("")
    setUsernameErr("")
    const normalized = normalizeUsername(usernameInput)

    if (!isValidUsername(normalized)) {
      setUsernameErr("Kullanici adi 3-20 karakter olmali; sadece kucuk harf, rakam ve _ kullanin.")
      return
    }
    setSavingUsername(true)
    try {
      const token = await getToken()
      if (!token) {
        setUsernameErr("Oturum bulunamadi. Tekrar giris yapin.")
        return
      }

      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: normalized }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        profile?: { username?: string | null }
      }
      if (!res.ok) {
        setUsernameErr(json.error || "Kullanici adi kaydedilemedi.")
        return
      }

      const saved = String(json.profile?.username || normalized).trim()
      setUsername(saved)
      setUsernameInput("")
      setUsernameMsg("Kullanici adi guncellendi.")
    } catch {
      setUsernameErr("Baglanti hatasi.")
    } finally {
      setSavingUsername(false)
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
        headers: { Authorization: `Bearer ${token}` },
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

  async function uploadAvatar(file: File) {
    setUsernameErr("")
    setUsernameMsg("")

    if (!username) {
      setUsernameErr("Once kullanici adinizi kaydedin, sonra profil fotografi yukleyin.")
      return
    }

    setAvatarUploading(true)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const path = `avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      })
      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      const uploadedAvatarUrl = String(data.publicUrl || "").trim()
      if (!uploadedAvatarUrl) throw new Error("Profil fotografi URL alinmadi.")

      const token = await getToken()
      if (!token) throw new Error("Oturum bulunamadi. Tekrar giris yapin.")

      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username,
          avatar_url: uploadedAvatarUrl,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        profile?: { avatar_url?: string | null }
      }
      if (!res.ok) throw new Error(json.error || "Profil fotografi kaydedilemedi.")

      setAvatarUrl(String(json.profile?.avatar_url || uploadedAvatarUrl))
      setUsernameMsg("Profil fotografi guncellendi.")
    } catch (e: unknown) {
      setUsernameErr(e instanceof Error ? e.message : "Profil fotografi yuklenemedi.")
    } finally {
      setAvatarUploading(false)
    }
  }

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/login?next=/profile")
      return
    }
    loadMyProfile()
    loadMyProducts()
  }, [isLoggedIn, loadMyProducts, loadMyProfile, router])

  if (!isLoggedIn) {
    return (
      <main className="container-app">
        <div className="card p-6">Yonlendiriliyorsunuz...</div>
      </main>
    )
  }

  return (
    <main className="container-app space-y-4">
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <section className="card space-y-4 p-8">
          <h1 className="text-3xl font-extrabold">Profil</h1>
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="relative h-16 w-16 overflow-hidden rounded-full border bg-black/5">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={username || "Profil"} fill className="object-cover" sizes="64px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold">
                    {(username || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer rounded-lg border px-3 py-2 text-sm">
                  {avatarUploading ? "Yukleniyor..." : "Profil Fotografi Ekle"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={avatarUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadAvatar(file)
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="text-sm text-muted">Kullanici Adi</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="font-semibold">{username || "-"}</p>
              {getMemberBadge(memberSince) ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  {getMemberBadge(memberSince)}
                </span>
              ) : null}
            </div>
            {!username ? (
              <>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(normalizeUsername(e.target.value))}
                    placeholder="kullanici_adi"
                    className="sm:max-w-sm"
                  />
                  <button className="btn-ghost sm:w-auto" onClick={saveUsername} disabled={savingUsername}>
                    {savingUsername ? "Kaydediliyor..." : "Kullanici Adini Kaydet"}
                  </button>
                </div>
                <p className="text-xs text-muted">3-20 karakter: kucuk harf, rakam, alt cizgi (_)</p>
              </>
            ) : null}
            {usernameErr ? <p className="text-sm text-red-600">{usernameErr}</p> : null}
            {usernameMsg ? <p className="text-sm text-green-700">{usernameMsg}</p> : null}
          </div>
        </section>

        <aside className="card space-y-3 p-8">
          <h2 className="text-xl font-extrabold">Mesaj Gonder</h2>
          <p className="text-sm text-muted">
            Sohbetlerini goruntulemek veya yeni mesaj baslatmak icin sohbetler ekranina git.
          </p>
          <button className="btn-primary w-full" onClick={() => router.push("/chats")}>
            Sohbetlere Git
          </button>
          <button className="btn-ghost w-full" onClick={() => router.push("/owner-products")}>
            Yeni Ilan Ekle
          </button>
          <button className="btn-ghost w-full" onClick={() => router.push("/rentals")}>
            Kiralamalarim
          </button>
          <button className="btn-ghost w-full" onClick={signOut}>
            Cikis Yap
          </button>
        </aside>
      </div>

      <div className="card space-y-4 p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold">Verdigim Ilanlar</h2>
          <button className="btn-ghost" onClick={loadMyProducts} disabled={listLoading}>
            {listLoading ? "Yukleniyor..." : "Yenile"}
          </button>
        </div>

        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}
        {msg ? (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/15 px-4 py-3 text-sm text-green-700">
            {msg}
          </div>
        ) : null}

        {myProducts.length === 0 ? (
          <p className="text-sm text-muted">Henuz ilan eklemediniz.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {myProducts.map((p) => (
              <div key={p.id} className="space-y-2">
                <ProductCard
                  product={{
                    id: p.id,
                    title: p.title,
                    daily_price: p.daily_price,
                    image_url: p.image_url,
                    image_urls: p.image_urls,
                    description: p.description,
                    tags: p.tags,
                    owner_email: userEmail,
                    owner_username: username || p.owner_username || null,
                    owner_avatar_url: avatarUrl || p.owner_avatar_url || null,
                  }}
                  variant="profile"
                />
                <button
                  className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id ? "Siliniyor..." : "Ilani Sil"}
                </button>
                <button
                  className="w-full rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700"
                  onClick={() => router.push(`/chats?product=${encodeURIComponent(p.id)}`)}
                >
                  Mesaj Gonder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
