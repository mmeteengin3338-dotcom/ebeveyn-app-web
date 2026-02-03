"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/app/lib/supabaseClient"
import { useAuth } from "@/app/context/AuthContext"

type ThreadMessage = {
  id: string
  sender_email?: string | null
  receiver_email?: string | null
  text?: string | null
  created_at?: string | null
}

export default function ProductMessagePage() {
  const router = useRouter()
  const params = useParams<{ productId: string }>()
  const searchParams = useSearchParams()
  const { isLoggedIn, userEmail } = useAuth()

  const productId = useMemo(() => String(params?.productId || "").trim(), [params?.productId])
  const peerFromUrl = useMemo(
    () => String(searchParams.get("peer") || searchParams.get("owner") || "").trim().toLowerCase(),
    [searchParams]
  )

  const [productTitle, setProductTitle] = useState("")
  const [peerEmail] = useState(peerFromUrl)
  const [items, setItems] = useState<ThreadMessage[]>([])
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState("")
  const [info, setInfo] = useState("")

  const loadThread = useCallback(async () => {
    setLoading(true)
    setErr("")
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        router.push(`/login?next=/messages/${encodeURIComponent(productId)}?peer=${encodeURIComponent(peerEmail)}`)
        return
      }

      const res = await fetch(
        `/api/messages/thread?product_id=${encodeURIComponent(productId)}&peer_email=${encodeURIComponent(peerEmail)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        product_title?: string
        messages?: ThreadMessage[]
      }

      if (!res.ok) {
        setItems([])
        setErr(json.error || "Mesajlar alinamadi.")
        return
      }

      setProductTitle(String(json.product_title || "Ilan Mesajlari"))
      setItems(Array.isArray(json.messages) ? json.messages : [])
    } catch {
      setItems([])
      setErr("Baglanti hatasi.")
    } finally {
      setLoading(false)
    }
  }, [peerEmail, productId, router])

  useEffect(() => {
    if (!isLoggedIn) {
      router.push(`/login?next=/messages/${encodeURIComponent(productId)}?peer=${encodeURIComponent(peerFromUrl)}`)
      return
    }
    if (!peerEmail) {
      setErr("Mesajlasma icin ilan sahibi bilgisi bulunamadi.")
      setLoading(false)
      return
    }
    loadThread()
  }, [isLoggedIn, loadThread, peerEmail, peerFromUrl, productId, router])

  async function handleSend() {
    setErr("")
    setInfo("")
    if (!text.trim()) {
      setErr("Lutfen bir mesaj yazin.")
      return
    }
    setSending(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        router.push(`/login?next=/messages/${encodeURIComponent(productId)}?peer=${encodeURIComponent(peerEmail)}`)
        return
      }

      const res = await fetch("/api/messages/thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: productId,
          peer_email: peerEmail,
          message: text.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setErr(json.error || "Mesaj gonderilemedi.")
        return
      }

      setText("")
      setInfo("Mesaj gonderildi.")
      await loadThread()
    } catch {
      setErr("Baglanti hatasi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="container-app">
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold">Mesajlasma</h1>
            <p className="text-sm text-muted">
              {productTitle || "Ilan"} - {peerEmail || "-"}
            </p>
          </div>
          <button className="btn-ghost" onClick={loadThread} disabled={loading}>
            {loading ? "Yukleniyor..." : "Yenile"}
          </button>
        </div>

        {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
        {info ? <p className="mb-3 text-sm text-green-700">{info}</p> : null}

        <div className="max-h-[420px] space-y-3 overflow-auto rounded-xl border bg-white p-3">
          {!loading && items.length === 0 ? (
            <p className="text-sm text-muted">Henuz mesaj yok.</p>
          ) : null}
          {items.map((m) => {
            const mine = userEmail && m.sender_email?.toLowerCase() === userEmail.toLowerCase()
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl border px-3 py-2 text-sm ${
                  mine ? "ml-auto bg-pink-100" : "mr-auto bg-white"
                }`}
              >
                <div className="mb-1 text-xs opacity-70">{mine ? "Ben" : m.sender_email}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
                <div className="mt-1 text-[11px] opacity-60">
                  {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mesaj yazin..."
            className="min-h-[54px] flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button className="btn-primary h-[54px] shrink-0 px-5" onClick={handleSend} disabled={sending}>
            {sending ? "..." : "Gonder"}
          </button>
        </div>
      </div>
    </main>
  )
}
