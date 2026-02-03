"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/app/lib/supabaseClient"
import { rentalStatusLabelTr, type Rental, type RentalStatus } from "@/app/lib/rentals"

type RentalsTab = "outgoing" | "incoming"
type IncomingStatus = Extract<RentalStatus, "approved" | "rejected">

export default function RentalsClient() {
  const router = useRouter()
  const [tab, setTab] = useState<RentalsTab>("outgoing")
  const [outgoingItems, setOutgoingItems] = useState<Rental[]>([])
  const [incomingItems, setIncomingItems] = useState<Rental[]>([])
  const [outgoingLoading, setOutgoingLoading] = useState(true)
  const [incomingLoading, setIncomingLoading] = useState(true)
  const [outgoingErr, setOutgoingErr] = useState<string | null>(null)
  const [incomingErr, setIncomingErr] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }, [])

  const loadOutgoing = useCallback(async () => {
    setOutgoingLoading(true)
    setOutgoingErr(null)
    try {
      const token = await getToken()
      if (!token) {
        setOutgoingErr("Kiralamalari gormek icin lutfen giris yap.")
        setOutgoingItems([])
        router.push("/login?next=/rentals")
        return
      }

      const res = await fetch("/api/rentals", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const json = await res.json()
      if (!res.ok) {
        setOutgoingErr(json?.error || "Kiralamalar alinamadi.")
        setOutgoingItems([])
        return
      }
      setOutgoingItems(json?.rentals || [])
    } catch {
      setOutgoingErr("Baglanti hatasi.")
      setOutgoingItems([])
    } finally {
      setOutgoingLoading(false)
    }
  }, [getToken, router])

  const loadIncoming = useCallback(async () => {
    setIncomingLoading(true)
    setIncomingErr(null)
    try {
      const token = await getToken()
      if (!token) {
        setIncomingErr("Gelen talepleri gormek icin lutfen giris yap.")
        setIncomingItems([])
        return
      }

      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        fetch("/api/owner/rentals?status=pending", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/owner/rentals?status=approved", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/owner/rentals?status=rejected", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const [pendingJson, approvedJson, rejectedJson] = await Promise.all([
        pendingRes.json().catch(() => ({})),
        approvedRes.json().catch(() => ({})),
        rejectedRes.json().catch(() => ({})),
      ])

      if (!pendingRes.ok || !approvedRes.ok || !rejectedRes.ok) {
        const firstErr =
          pendingJson?.error || approvedJson?.error || rejectedJson?.error || "Gelen talepler alinamadi."
        setIncomingErr(firstErr)
        setIncomingItems([])
        return
      }

      const combined = [
        ...(pendingJson?.rentals || []),
        ...(approvedJson?.rentals || []),
        ...(rejectedJson?.rentals || []),
      ] as Rental[]

      const deduped = Array.from(new Map(combined.map((item) => [item.id, item])).values())
      deduped.sort(
        (a, b) =>
          new Date(String(b.created_at || "")).getTime() -
          new Date(String(a.created_at || "")).getTime()
      )
      setIncomingItems(deduped)
    } catch {
      setIncomingErr("Baglanti hatasi.")
      setIncomingItems([])
    } finally {
      setIncomingLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    loadOutgoing()
    loadIncoming()
  }, [loadIncoming, loadOutgoing])

  async function updateIncomingStatus(id: string, status: IncomingStatus) {
    const actionLabel = status === "approved" ? "onaylamak" : "reddetmek"
    const ok = window.confirm(`Bu talebi ${actionLabel} istediginize emin misiniz?`)
    if (!ok) return

    setUpdatingId(id)
    try {
      const token = await getToken()
      if (!token) {
        alert("Durum guncellemek icin lutfen giris yapin.")
        router.push("/login?next=/rentals")
        return
      }

      const res = await fetch("/api/owner/rentals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json?.error || "Guncellenemedi")
        return
      }

      const nextStatus = (json?.rental?.status || status) as RentalStatus
      setIncomingItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item))
      )
    } catch {
      alert("Baglanti hatasi")
    } finally {
      setUpdatingId(null)
    }
  }

  const isOutgoingTab = tab === "outgoing"
  const loading = isOutgoingTab ? outgoingLoading : incomingLoading
  const err = isOutgoingTab ? outgoingErr : incomingErr
  const visibleItems = isOutgoingTab ? outgoingItems : incomingItems

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-5xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Kiralamalarim</h1>

          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-4 py-2 text-sm ${
                isOutgoingTab ? "bg-black text-white" : "bg-white"
              }`}
              onClick={() => setTab("outgoing")}
            >
              Taleplerim
            </button>
            <button
              className={`rounded-full border px-4 py-2 text-sm ${
                !isOutgoingTab ? "bg-black text-white" : "bg-white"
              }`}
              onClick={() => setTab("incoming")}
            >
              Gelen Talepler
            </button>
            <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => router.push("/")}>
              Ana sayfa
            </button>
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={() => (isOutgoingTab ? loadOutgoing() : loadIncoming())}
            >
              Yenile
            </button>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm">Yukleniyor...</p> : null}
        {err ? <p className="mt-4 text-sm text-red-600">{err}</p> : null}

        {!loading && !err && visibleItems.length === 0 ? (
          <p className="mt-4 text-sm">
            {isOutgoingTab ? "Henuz bir kiralama talebin yok." : "Gelen talep yok."}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {visibleItems.map((r) => (
            <div key={r.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{r.product_title}</div>
                  <div className="mt-1 text-sm">
                    Gunluk: <span className="font-semibold">{r.daily_price} TL</span>
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    r.status === "approved"
                      ? "border-green-600 bg-green-100 text-green-800"
                      : r.status === "rejected"
                        ? "border-red-600 bg-red-100 text-red-800"
                        : "border-yellow-600 bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {rentalStatusLabelTr[r.status]}
                </span>
              </div>

              {isOutgoingTab ? (
                <div className="mt-3">
                  <button
                    className="rounded-lg border px-4 py-2 text-sm"
                    onClick={() => router.push(`/product/${r.product_id}`)}
                  >
                    Urune git
                  </button>
                </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={`rounded-lg border px-4 py-2 text-sm disabled:opacity-60 ${
                        r.status === "approved"
                          ? "border-green-600 bg-green-500 text-white"
                          : "border-gray-300 bg-white"
                      }`}
                      onClick={() => updateIncomingStatus(r.id, "approved")}
                      disabled={updatingId === r.id}
                    >
                      Onayla
                    </button>
                    <button
                      className={`rounded-lg border px-4 py-2 text-sm disabled:opacity-60 ${
                        r.status === "rejected"
                          ? "border-red-600 bg-red-500 text-white"
                          : "border-gray-300 bg-white"
                      }`}
                      onClick={() => updateIncomingStatus(r.id, "rejected")}
                      disabled={updatingId === r.id}
                    >
                      Reddet
                    </button>
                    {r.status === "pending" ? (
                      <span className="rounded-lg border border-yellow-600 bg-yellow-100 px-4 py-2 text-sm text-yellow-800">
                        Beklemede
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
          ))}
        </div>
      </div>
    </div>
  )
}
