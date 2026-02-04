"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../lib/supabaseClient"
import { removeFromCart } from "../lib/localCollections"

type Product = {
  id: string
  title: string
  daily_price: number
  image_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  owner_email?: string | null
}

function toISODate(value: Date) {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

export default function CheckoutPage() {
  const router = useRouter()
  const params = useSearchParams()
  const productId = String(params.get("product") || "").trim()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [days, setDays] = useState(1)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("")
  const [district, setDistrict] = useState("")
  const [addressLine, setAddressLine] = useState("")

  const [cardName, setCardName] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvv, setCvv] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const controller = new AbortController()

    async function loadProduct() {
      if (!productId) {
        setError("Urun secimi bulunamadi.")
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = (await res.json().catch(() => ({}))) as {
          product?: Product
          error?: string
        }

        if (!alive) return
        if (!res.ok || !json.product) {
          setError(json.error || "Urun bulunamadi.")
          setProduct(null)
          return
        }

        setProduct(json.product)
      } catch {
        if (!alive) return
        setError("Baglanti hatasi.")
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }

    loadProduct()

    return () => {
      alive = false
      controller.abort()
    }
  }, [productId])

  const imageSrc = useMemo(() => {
    if (!product) return "/products/placeholder.jpg"
    const gallery = Array.isArray(product.image_urls)
      ? product.image_urls.find((u) => String(u || "").trim().length > 0)
      : null
    return gallery || product.image_url || "/products/placeholder.jpg"
  }, [product])

  const total = useMemo(() => {
    if (!product) return 0
    return Math.max(1, days) * Number(product.daily_price || 0)
  }, [days, product])

  async function submitOrder(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitOk(null)

    if (!product) {
      setSubmitError("Urun bilgisi bulunamadi.")
      return
    }

    if (days < 1 || days > 30) {
      setSubmitError("Gun sayisi 1-30 araliginda olmali.")
      return
    }

    if (!fullName.trim() || !phone.trim() || !city.trim() || !district.trim() || !addressLine.trim()) {
      setSubmitError("Lutfen adres bilgilerini eksiksiz doldur.")
      return
    }

    if (!cardName.trim() || !cardNumber.trim() || !expiry.trim() || !cvv.trim()) {
      setSubmitError("Lutfen odeme bilgi alanlarini doldur.")
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(`/checkout?product=${product.id}`)}`)
      return
    }

    const startDate = new Date()
    const endDate = addDays(startDate, days - 1)

    const offerNote = `Teslimat: ${fullName.trim()} / ${phone.trim()} / ${city.trim()} / ${district.trim()} / ${addressLine.trim()}`

    setSubmitting(true)
    try {
      const res = await fetch("/api/rentals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          start_date: toISODate(startDate),
          end_date: toISODate(endDate),
          offer_note: offerNote,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSubmitError(json.error || "Siparis tamamlanamadi.")
        return
      }

      removeFromCart(product.id)
      setSubmitOk("Siparis basariyla tamamlandi. Teklif urun sahibine iletildi.")
      setTimeout(() => router.push("/rentals"), 1400)
    } catch {
      setSubmitError("Baglanti hatasi. Tekrar dene.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-black/10 bg-white p-8">Odeme sayfasi yukleniyor...</div>
      </main>
    )
  }

  if (error || !product) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
        <div className="mx-auto max-w-6xl rounded-3xl border border-black/10 bg-white p-8">
          <p className="text-red-600">{error || "Urun bulunamadi."}</p>
          <Link href="/cart" className="mt-4 inline-flex rounded-xl border px-4 py-2">
            Sepetime don
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[1fr,360px]">
        <form onSubmit={submitOrder} className="space-y-6 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <header className="rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-100 via-rose-100 to-pink-100 p-4">
            <h1 className="text-3xl font-bold">Siparis ve Teklif Onayi</h1>
            <p className="text-black/60">Gun sec, adresini gir, odeme bilgilerini tamamla ve siparisi gonder.</p>
          </header>

          <section className="rounded-2xl border border-black/10 p-4">
            <h2 className="text-xl font-semibold">1) Kac gun kiralanacak?</h2>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-28 rounded-xl border px-3 py-2 text-lg font-semibold"
              />
              <span className="text-black/60">gun</span>
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 p-4">
            <h2 className="text-xl font-semibold">2) Adres Bilgileri</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ad Soyad"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Telefon"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Il"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Ilce"
                className="rounded-xl border px-3 py-2"
              />
            </div>
            <textarea
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              rows={3}
              placeholder="Acik adres"
              className="mt-3 w-full rounded-xl border px-3 py-2"
            />
          </section>

          <section className="rounded-2xl border border-black/10 p-4">
            <h2 className="text-xl font-semibold">3) Odeme Bilgileri (Altyapi hazir)</h2>
            <p className="mt-1 text-sm text-black/60">Gercek odeme entegrasyonu sonraki adimda eklenecek.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Kart uzerindeki ad"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="Kart numarasi"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="Son kullanma (AA/YY)"
                className="rounded-xl border px-3 py-2"
              />
              <input
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                placeholder="CVV"
                className="rounded-xl border px-3 py-2"
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-orange-500 px-5 py-3 text-lg font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? "Siparis tamamlanıyor..." : "Siparisi Tamamla"}
          </button>

          {submitError ? <p className="text-sm font-semibold text-red-600">{submitError}</p> : null}
          {submitOk ? <p className="text-sm font-semibold text-emerald-600">{submitOk}</p> : null}
        </form>

        <aside className="h-fit rounded-3xl border border-black/10 bg-white p-5 shadow-sm xl:sticky xl:top-32">
          <h2 className="text-2xl font-bold">Siparis Ozeti</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-pink-200 bg-pink-50">
            <div className="relative h-44 w-full bg-white">
              <Image src={imageSrc} alt={product.title} fill className="object-contain p-2" sizes="360px" />
            </div>
            <div className="p-3">
              <p className="line-clamp-1 text-lg font-semibold">{product.title}</p>
              <p className="text-sm text-black/60">Gunluk: {product.daily_price} TL</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 border-t border-black/10 pt-4 text-sm">
            <div className="flex justify-between">
              <span>Gun</span>
              <span className="font-semibold">{days}</span>
            </div>
            <div className="flex justify-between">
              <span>Ara toplam</span>
              <span className="font-semibold">{total} TL</span>
            </div>
            <div className="flex justify-between">
              <span>Kargo</span>
              <span className="font-semibold text-emerald-600">Bedava</span>
            </div>
          </div>

          <div className="mt-4 border-t border-black/10 pt-4">
            <div className="flex justify-between text-xl font-bold">
              <span>Toplam</span>
              <span className="text-orange-600">{total} TL</span>
            </div>
          </div>

          <Link href="/cart" className="mt-4 inline-flex rounded-xl border border-black/15 px-3 py-2 text-sm">
            Sepete geri don
          </Link>
        </aside>
      </div>
    </main>
  )
}

