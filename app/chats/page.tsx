"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "@/app/lib/supabaseClient"
import { useAuth } from "@/app/context/AuthContext"

type Msg = {
  id: string
  product_id: string
  product_title?: string | null
  sender_email?: string | null
  sender_username?: string | null
  receiver_email?: string | null
  receiver_username?: string | null
  product_image_url?: string | null
  text?: string | null
  created_at?: string | null
  delivered_at?: string | null
  read_at?: string | null
}

type Conversation = {
  key: string
  productId: string
  productTitle: string
  peerEmail: string
  peerName: string
  productImageUrl?: string | null
  lastText: string
  lastAt: string
}

type DeliveryStatus = "sent" | "delivered" | "read"

function DeliveryTicks({ status }: { status: DeliveryStatus }) {
  const isRead = status === "read"
  const isDelivered = status === "delivered"

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center text-xs font-bold ${
          isRead ? "text-rose-700" : isDelivered ? "text-white" : "text-gray-200"
        }`}
        title={isRead ? "Goruldu" : isDelivered ? "Iletildi" : "Gonderildi"}
      >
        {status === "sent" ? "✓" : "✓✓"}
      </span>
      <span className={`text-[11px] ${isRead ? "text-rose-700" : isDelivered ? "text-white" : "text-gray-200"}`}>
        {isRead ? "Goruldu" : isDelivered ? "Iletildi" : "Gonderildi"}
      </span>
    </span>
  )
}

export default function ChatsPage() {
  const router = useRouter()
  const { isLoggedIn, userEmail } = useAuth()

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [allMessages, setAllMessages] = useState<Msg[]>([])
  const [activeKey, setActiveKey] = useState("")
  const [thread, setThread] = useState<Msg[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState("")
  const [requestedProduct, setRequestedProduct] = useState("")
  const [requestedPeer, setRequestedPeer] = useState("")
  const conversationsInFlightRef = useRef(false)
  const threadInFlightRef = useRef(false)

  const saveSeenMessageIds = useCallback((ids: string[]) => {
    if (!userEmail || typeof window === "undefined" || ids.length === 0) return
    const key = `seen_message_ids:${userEmail.toLowerCase()}`
    try {
      const raw = window.localStorage.getItem(key)
      const prev = raw ? (JSON.parse(raw) as string[]) : []
      const merged = Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...ids]))
      window.localStorage.setItem(key, JSON.stringify(merged.slice(-500)))
    } catch {
      // local cache is best-effort only
    }
  }, [userEmail])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    setRequestedProduct(String(params.get("product") || "").trim())
    setRequestedPeer(String(params.get("peer") || "").trim().toLowerCase())
  }, [])

  const conversations = useMemo<Conversation[]>(() => {
    if (!userEmail) return []

    const map = new Map<string, Conversation>()
    for (const m of allMessages) {
      const sender = String(m.sender_email || "").toLowerCase()
      const receiver = String(m.receiver_email || "").toLowerCase()
      const me = userEmail.toLowerCase()
      const peer = sender === me ? receiver : sender
      const peerName = String(
        sender === me ? (m.receiver_username || m.receiver_email || "") : (m.sender_username || m.sender_email || "")
      ).trim()
      if (!peer || !m.product_id) continue

      const key = peer
      const createdAt = String(m.created_at || "")
      const current = map.get(key)

      if (!current || createdAt > current.lastAt) {
        map.set(key, {
          key,
          productId: m.product_id,
          productTitle: String(m.product_title || "Ilan"),
          peerEmail: peer,
          peerName: peerName || peer,
          productImageUrl: String(m.product_image_url || ""),
          lastText: String(m.text || ""),
          lastAt: createdAt,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  }, [allMessages, userEmail])

  const conversationItems = useMemo(() => {
    if (!requestedPeer) return conversations
    const exists = conversations.some((c) => c.peerEmail === requestedPeer)
    if (exists) return conversations
    return [
      {
        key: requestedPeer,
        productId: requestedProduct || "",
        productTitle: "Ilan",
        peerEmail: requestedPeer,
        peerName: requestedPeer,
        productImageUrl: "",
        lastText: "",
        lastAt: "",
      },
      ...conversations,
    ]
  }, [conversations, requestedPeer, requestedProduct])

  const unreadByConversation = useMemo(() => {
    const result = new Map<string, number>()
    if (!userEmail) return result

    const me = userEmail.toLowerCase()
    for (const m of allMessages) {
      const sender = String(m.sender_email || "").toLowerCase()
      const receiver = String(m.receiver_email || "").toLowerCase()
      if (!m.product_id || receiver !== me || !!m.read_at) continue

      const key = sender
      result.set(key, (result.get(key) || 0) + 1)
    }
    return result
  }, [allMessages, userEmail])

  const totalUnread = useMemo(() => {
    let total = 0
    unreadByConversation.forEach((n) => {
      total += n
    })
    return total
  }, [unreadByConversation])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("unread-count-changed", { detail: totalUnread }))
  }, [totalUnread])

  const activeConversation = useMemo(
    () => conversationItems.find((c) => c.key === activeKey) || null,
    [activeKey, conversationItems]
  )
  const activeThreadTarget = useMemo(() => {
    if (!activeKey) return null
    return {
      peerEmail: activeKey,
    }
  }, [activeKey])

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (conversationsInFlightRef.current) return
    conversationsInFlightRef.current = true
    const silent = options?.silent === true
    if (!silent) setLoading(true)
    setErr("")
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        router.push("/login?next=/chats")
        return
      }

      const res = await fetch("/api/messages?box=all", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await res.json().catch(() => ({}))) as { messages?: Msg[]; error?: string }
      if (!res.ok) {
        setAllMessages([])
        setErr(json.error || "Sohbetler alinamadi.")
        return
      }
      setAllMessages(Array.isArray(json.messages) ? json.messages : [])
    } catch {
      setErr("Baglanti hatasi.")
      setAllMessages([])
    } finally {
      if (!silent) setLoading(false)
      conversationsInFlightRef.current = false
    }
  }, [router])

  const loadThread = useCallback(
    async (peerEmail: string, options?: { silent?: boolean }) => {
      if (threadInFlightRef.current) return
      threadInFlightRef.current = true
      const silent = options?.silent === true
      if (!silent) setThreadLoading(true)
      setErr("")
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          router.push("/login?next=/chats")
          return
        }

        const res = await fetch(
          `/api/messages/thread?peer_email=${encodeURIComponent(peerEmail)}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        const json = (await res.json().catch(() => ({}))) as { messages?: Msg[]; error?: string }
        if (!res.ok) {
          setThread([])
          setErr(json.error || "Konusma alinamadi.")
          return
        }
        const messages = Array.isArray(json.messages) ? json.messages : []
        setThread(messages)

        // Thread acildiginda API read_at yazar; badge'in aninda dusmesi icin lokalde de isaretle.
        if (userEmail) {
          const nowIso = new Date().toISOString()
          const me = userEmail.toLowerCase()
          const peer = peerEmail.toLowerCase()
          const newlySeenIds: string[] = []
          setAllMessages((prev) =>
            prev.map((m) => {
              const sender = String(m.sender_email || "").toLowerCase()
              const receiver = String(m.receiver_email || "").toLowerCase()
              if (sender === peer && receiver === me && !m.read_at) {
                if (m.id) newlySeenIds.push(m.id)
                return {
                  ...m,
                  delivered_at: m.delivered_at || nowIso,
                  read_at: nowIso,
                }
              }
              return m
            })
          )
          saveSeenMessageIds(newlySeenIds)
        }
      } catch {
        setThread([])
        setErr("Baglanti hatasi.")
      } finally {
        if (!silent) setThreadLoading(false)
        threadInFlightRef.current = false
      }
    },
    [router, saveSeenMessageIds, userEmail]
  )

  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/login?next=/chats")
      return
    }
    loadConversations()
  }, [isLoggedIn, loadConversations, router])

  useEffect(() => {
    if (conversationItems.length === 0) {
      setActiveKey("")
      setThread([])
      return
    }

    if (requestedProduct && requestedPeer) {
      const requestedKey = requestedPeer
      const found = conversationItems.find((c) => c.key === requestedKey)
      if (found) {
        setActiveKey(found.key)
        setSelectedProductId(requestedProduct || found.productId)
        return
      }
    }

    if (!conversationItems.some((c) => c.key === activeKey)) {
      setActiveKey(conversationItems[0].key)
      setSelectedProductId(conversationItems[0].productId)
    }
  }, [activeKey, conversationItems, requestedPeer, requestedProduct])

  useEffect(() => {
    if (!activeThreadTarget) return
    loadThread(activeThreadTarget.peerEmail, { silent: false })
  }, [activeThreadTarget, loadThread])

  useEffect(() => {
    if (!isLoggedIn) return

    const refresh = () => {
      loadConversations({ silent: true })
      if (activeThreadTarget) {
        loadThread(activeThreadTarget.peerEmail, { silent: true })
      }
    }

    const intervalId = setInterval(refresh, 4000)
    const onFocus = () => refresh()

    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [activeThreadTarget, isLoggedIn, loadConversations, loadThread])

  async function sendMessage() {
      if (!activeConversation || !text.trim()) return
    const targetProductId = selectedProductId || activeConversation.productId
    if (!targetProductId) {
      setErr("Mesaj gondermek icin once bir ilani secin.")
      return
    }
    setSending(true)
    setErr("")

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        router.push("/login?next=/chats")
        return
      }

      const res = await fetch("/api/messages/thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: targetProductId,
          peer_email: activeConversation.peerEmail,
          message: text.trim(),
        }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setErr(json.error || "Mesaj gonderilemedi.")
        return
      }

      setText("")
      await Promise.all([
        loadThread(activeConversation.peerEmail, { silent: true }),
        loadConversations({ silent: true }),
      ])
    } catch {
      setErr("Baglanti hatasi.")
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="container-app">
      <div className="card h-[78vh] overflow-hidden p-0">
        <div className="grid h-full grid-cols-1 md:grid-cols-[320px,1fr]">
          <aside className="border-r bg-white">
            <div className="border-b px-4 py-3 font-bold">
              Sohbetler
              {totalUnread > 0 ? (
                <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">
                  {totalUnread}
                </span>
              ) : null}
            </div>
            {loading ? <p className="p-4 text-sm text-muted">Yukleniyor...</p> : null}
            {!loading && conversationItems.length === 0 ? (
              <p className="p-4 text-sm text-muted">Henuz sohbet yok.</p>
            ) : null}

            <div className="max-h-[calc(78vh-54px)] overflow-auto">
              {conversationItems.map((c) => (
                <button
                  key={c.key}
                  className={`w-full border-b px-4 py-3 text-left ${
                    activeKey === c.key ? "bg-pink-100" : "bg-white hover:bg-black/5"
                  }`}
                  onClick={() => {
                    setActiveKey(c.key)
                    setSelectedProductId(c.productId)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border bg-black/5">
                        {c.productImageUrl ? (
                          <Image src={c.productImageUrl} alt={c.productTitle} fill className="object-cover" sizes="32px" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">I</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{c.productTitle}</div>
                    </div>
                    {(unreadByConversation.get(c.key) || 0) > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] text-white">
                        {unreadByConversation.get(c.key)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs opacity-70">{c.peerName}</div>
                  <div className="mt-1 line-clamp-1 text-xs opacity-70">{c.lastText}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex h-full flex-col bg-white">
            {activeConversation ? (
              <>
                <div className="border-b px-4 py-3">
                  <div className="font-semibold">{activeConversation.peerName}</div>
                  <div className="text-xs opacity-70">{activeConversation.productTitle}</div>
                </div>

                <div className="flex-1 space-y-3 overflow-auto bg-pink-50/30 p-4">
                  <div className="rounded-xl border bg-white px-3 py-2">
                    <div className="text-xs text-muted">Ilan</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="relative h-10 w-10 overflow-hidden rounded-md border bg-black/5">
                          {activeConversation.productImageUrl ? (
                            <Image
                              src={activeConversation.productImageUrl}
                              alt={activeConversation.productTitle}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold">I</div>
                          )}
                        </div>
                        <div className="text-sm font-semibold">{activeConversation.productTitle}</div>
                      </div>
                      <Link
                        href={`/product/${encodeURIComponent(activeConversation.productId)}`}
                        className="rounded-lg border px-2 py-1 text-xs"
                      >
                        Ilani Gor
                      </Link>
                    </div>
                  </div>

                  {threadLoading ? <p className="text-sm text-muted">Konusma yukleniyor...</p> : null}
                  {!threadLoading && thread.length === 0 ? (
                    <p className="text-sm text-muted">Bu sohbette mesaj yok.</p>
                  ) : null}

                  {thread.map((m) => {
                    const mine =
                      !!userEmail && String(m.sender_email || "").toLowerCase() === userEmail.toLowerCase()
                    const status: DeliveryStatus = m.read_at ? "read" : m.delivered_at ? "delivered" : "sent"

                    return (
                      <div
                        key={m.id}
                        className={`max-w-[78%] rounded-xl border px-3 py-2 text-sm ${
                          mine ? "ml-auto bg-pink-300" : "mr-auto bg-white"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        <div className="mt-1 flex items-center justify-end gap-2 text-[11px]">
                          <span className="opacity-70">
                            {m.created_at ? new Date(m.created_at).toLocaleTimeString() : ""}
                          </span>
                          {mine ? <DeliveryTicks status={status} /> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="border-t p-3">
                  {err ? <p className="mb-2 text-xs text-red-600">{err}</p> : null}
                  <div className="flex gap-2">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Mesaj yaz..."
                      className="min-h-[54px] flex-1 rounded-xl border px-3 py-2 text-sm"
                    />
                    <button className="btn-primary h-[54px] px-5" onClick={sendMessage} disabled={sending}>
                      {sending ? "..." : "Gonder"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="m-auto text-sm text-muted">Bir sohbet secin.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
