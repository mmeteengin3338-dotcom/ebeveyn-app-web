"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabaseClient"
import { removeFromCart } from "../lib/localCollections"
import {
  getSavedAddresses,
  type SavedAddress,
  upsertSavedAddress,
} from "../lib/userAddresses"

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

function formatTrPhone(input: string) {
  let digits = String(input || "").replace(/\D/g, "")
  if (digits.startsWith("90")) digits = digits.slice(2)
  if (digits.startsWith("0")) digits = digits.slice(1)
  digits = digits.slice(0, 10)

  let out = "+90"
  if (digits.length > 0) out += " " + digits.slice(0, 3)
  if (digits.length > 3) out += " " + digits.slice(3, 6)
  if (digits.length > 6) out += " " + digits.slice(6, 8)
  if (digits.length > 8) out += " " + digits.slice(8, 10)
  return out
}

function getPhoneDigits(phone: string) {
  let digits = String(phone || "").replace(/\D/g, "")
  if (digits.startsWith("90")) digits = digits.slice(2)
  if (digits.startsWith("0")) digits = digits.slice(1)
  return digits
}

export default function CheckoutPage() {
  const router = useRouter()
  const [productId, setProductId] = useState("")
  const [queryReady, setQueryReady] = useState(false)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [days, setDays] = useState(1)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("+90")
  const [city, setCity] = useState("")
  const [district, setDistrict] = useState("")
  const [addressLine, setAddressLine] = useState("")

  const [userKey, setUserKey] = useState("")
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState("")
  const [addressMsg, setAddressMsg] = useState<string | null>(null)

  const [cardName, setCardName] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvv, setCvv] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const id = String(new URLSearchParams(window.location.search).get("product") || "").trim()
    setProductId(id)
    setQueryReady(true)
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadAddressBook() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const key = String(data.session?.user?.id || data.session?.user?.email || "").trim()
      setUserKey(key)
      if (!key) return
      const list = getSavedAddresses(key)
      setSavedAddresses(list)
      if (list.length > 0) setSelectedAddressId(list[0].id)
    }

    loadAddressBook().catch(() => {
      // no-op
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!selectedAddressId) return
    const found = savedAddresses.find((x) => x.id === selectedAddressId)
    if (!found) return
    setFullName(found.fullName)
    setPhone(formatTrPhone(found.phone))
    setCity(found.city)
    setDistrict(found.district)
    setAddressLine(found.addressLine)
    setAddressMsg("Kayitli adres bilgileri otomatik dolduruldu.")
  }, [savedAddresses, selectedAddressId])

  useEffect(() => {
    if (!queryReady) return

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
  }, [productId, queryReady])

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

  function saveCurrentAddress() {
    setAddressMsg(null)
    if (!userKey) {
      setAddressMsg("Adres kaydi icin once giris yapman gerekiyor.")
      return
    }

    if (!fullName.trim() || !city.trim() || !district.trim() || !addressLine.trim()) {
      setAddressMsg("Kaydetmeden once adres alanlarini doldur.")
      return
    }

    const phoneDigits = getPhoneDigits(phone)
    if (phoneDigits.length !== 10) {
      setAddressMsg("Telefon numarasi 10 hane olmali.")
      return
    }

    const updated = upsertSavedAddress(userKey, {
      fullName: fullName.trim(),
      phone: formatTrPhone(phone),
      city: city.trim(),
      district: district.trim(),
      addressLine: addressLine.trim(),
    })

    setSavedAddresses(updated)
    if (updated.length > 0) setSelectedAddressId(updated[0].id)
    setAddressMsg("Adres kaydedildi.")
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitOk(null)

    if (!product) {
      setSubmitError("Urun bilgisi bulunamadi.")
      return
    }

    if (days < 1) {
      setSubmitError("Gun sayisi en az 1 olmali.")
      return
    }

    const phoneDigits = getPhoneDigits(phone)
    if (!fullName.trim() || phoneDigits.length !== 10 || !city.trim() || !district.trim() || !addressLine.trim()) {
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

    const offerNote = `Teslimat: ${fullName.trim()} / ${formatTrPhone(phone)} / ${city.trim()} / ${district.trim()} / ${addressLine.trim()}`

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

  if (loading || !queryReady) {
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
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-36 rounded-xl border px-3 py-2 text-lg font-semibold"
              />
              <span className="text-black/60">gun</span>
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">2) Adres Bilgileri</h2>
              <button
                type="button"
                onClick={saveCurrentAddress}
                className="rounded-lg border border-pink-300 bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700 hover:bg-pink-200"
              >
                Adresi Kaydet
              </button>
            </div>

            {savedAddresses.length > 0 ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-black/60">Kayitli Adreslerim</label>
                <select
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2"
                >
                  <option value="">Adres sec</option>
                  {savedAddresses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName} - {item.city}/{item.district}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ad Soyad" className="rounded-xl border px-3 py-2" />
              <input
                value={phone}
                onChange={(e) => setPhone(formatTrPhone(e.target.value))}
                placeholder="+90 5xx xxx xx xx"
                className="rounded-xl border px-3 py-2"
              />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Il" className="rounded-xl border px-3 py-2" />
              <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Ilce" className="rounded-xl border px-3 py-2" />
            </div>
            <textarea value={addressLine} onChange={(e) => setAddressLine(e.target.value)} rows={3} placeholder="Acik adres" className="mt-3 w-full rounded-xl border px-3 py-2" />
            {addressMsg ? <p className="mt-2 text-xs font-semibold text-pink-700">{addressMsg}</p> : null}
          </section>

          <section className="rounded-2xl border border-black/10 p-4">
            <h2 className="text-xl font-semibold">3) Odeme Bilgileri (Altyapi hazir)</h2>
            <p className="mt-1 text-sm text-black/60">Gercek odeme entegrasyonu sonraki adimda eklenecek.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Kart uzerindeki ad" className="rounded-xl border px-3 py-2" />
              <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Kart numarasi" className="rounded-xl border px-3 py-2" />
              <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="Son kullanma (AA/YY)" className="rounded-xl border px-3 py-2" />
              <input value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="CVV" className="rounded-xl border px-3 py-2" />
            </div>
          </section>

          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-orange-500 px-5 py-3 text-lg font-bold text-white transition hover:bg-orange-600 disabled:opacity-60">
            {submitting ? "Siparis tamamlaniyor..." : "Siparisi Tamamla"}
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
            <div className="flex justify-between"><span>Gun</span><span className="font-semibold">{days}</span></div>
            <div className="flex justify-between"><span>Ara toplam</span><span className="font-semibold">{total} TL</span></div>
            <div className="flex justify-between"><span>Kargo</span><span className="font-semibold text-emerald-600">Bedava</span></div>
          </div>

          <div className="mt-4 border-t border-black/10 pt-4">
            <div className="flex justify-between text-xl font-bold"><span>Toplam</span><span className="text-orange-600">{total} TL</span></div>
          </div>

          <Link href="/cart" className="mt-4 inline-flex rounded-xl border border-black/15 px-3 py-2 text-sm">Sepete geri don</Link>
        </aside>
      </div>
    </main>
  )
}
