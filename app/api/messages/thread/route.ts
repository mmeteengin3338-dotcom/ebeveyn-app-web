import { NextResponse } from "next/server"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isUuid } from "@/app/lib/validation"

async function requireAuthenticatedUser(request: Request) {
  const authClient = createAnonClient()
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return { ok: false as const, error: "Token eksik" }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user || !data.user.email) {
    return { ok: false as const, error: "Gecersiz token" }
  }

  return {
    ok: true as const,
    token,
    userId: data.user.id,
    email: data.user.email.trim().toLowerCase(),
  }
}

type MsgRow = {
  product_id?: string | null
  sender_email?: string | null
  receiver_email?: string | null
  [key: string]: unknown
}

async function enrichMessagesWithUsernames(db: ReturnType<typeof createUserTokenClient>, messages: MsgRow[]) {
  const emails = Array.from(
    new Set(
      messages
        .flatMap((m) => [String(m.sender_email || "").toLowerCase(), String(m.receiver_email || "").toLowerCase()])
        .filter((e) => e.length > 0)
    )
  )

  if (emails.length === 0) return messages

  const { data: profileRows, error } = await db
    .from("profiles")
    .select("email,username")
    .in("email", emails)

  // If profiles table is missing or inaccessible, return original payload.
  if (error || !Array.isArray(profileRows)) return messages

  const usernameByEmail = new Map(
    profileRows
      .map((row) => [String(row.email || "").toLowerCase(), String(row.username || "")] as const)
      .filter(([email, username]) => email.length > 0 && username.length > 0)
  )

  const productIds = Array.from(
    new Set(messages.map((m) => String(m.product_id || "")).filter((id) => id.length > 0))
  )
  let imageByProductId = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: productRows, error: productError } = await db
      .from("products")
      .select("id,image_url")
      .in("id", productIds)
    if (!productError && Array.isArray(productRows)) {
      imageByProductId = new Map(
        productRows
          .map((row) => [String(row.id || ""), String(row.image_url || "")] as const)
          .filter(([id, image]) => id.length > 0 && image.length > 0)
      )
    }
  }

  return messages.map((m) => {
    const senderEmail = String(m.sender_email || "").toLowerCase()
    const receiverEmail = String(m.receiver_email || "").toLowerCase()
    const productId = String(m.product_id || "")
    return {
      ...m,
      sender_username: usernameByEmail.get(senderEmail) || null,
      receiver_username: usernameByEmail.get(receiverEmail) || null,
      product_image_url: imageByProductId.get(productId) || null,
    }
  })
}

async function validateThreadParticipants(db: ReturnType<typeof createUserTokenClient>, productId: string, me: string, peerEmail: string) {
  const { data: product, error: productError } = await db
    .from("products")
    .select("id,title,owner_email")
    .eq("id", productId)
    .single()

  if (productError || !product) return { ok: false as const, status: 404, error: "Ilan bulunamadi" }

  const ownerEmail = asTrimmedString(product.owner_email).toLowerCase()
  if (!ownerEmail) return { ok: false as const, status: 400, error: "Ilan sahibi bilgisi bulunamadi" }

  const peer = peerEmail.toLowerCase()
  if (!peer) return { ok: false as const, status: 400, error: "peer_email zorunludur" }
  if (peer === me) return { ok: false as const, status: 400, error: "Kendinizle mesajlasamazsiniz" }

  const meIsOwner = me === ownerEmail
  if (!meIsOwner && peer !== ownerEmail) {
    return { ok: false as const, status: 403, error: "Bu ilanda sadece ilan sahibiyle mesajlasabilirsiniz" }
  }

  return {
    ok: true as const,
    ownerEmail,
    peer,
    productTitle: asTrimmedString(product.title),
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const url = new URL(request.url)
    const productId = asTrimmedString(url.searchParams.get("product_id"))
    const peerEmail = asTrimmedString(url.searchParams.get("peer_email")).toLowerCase()

    if (!peerEmail) return NextResponse.json({ error: "peer_email zorunludur" }, { status: 400 })
    if (peerEmail === auth.email) {
      return NextResponse.json({ error: "Kendinizle mesajlasamazsiniz" }, { status: 400 })
    }
    if (productId && !isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product_id" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)

    if (productId) {
      const valid = await validateThreadParticipants(db, productId, auth.email, peerEmail)
      if (!valid.ok) {
        return NextResponse.json({ error: valid.error }, { status: valid.status })
      }

      // Mark incoming messages as delivered when receiver opens thread.
      const deliveredUpdate = await db
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("product_id", productId)
        .eq("receiver_email", auth.email)
        .eq("sender_email", valid.peer)
        .is("delivered_at", null)

      // Backward compatibility: if delivered_at column does not exist, ignore this step.
      if (deliveredUpdate.error && !/delivered_at/i.test(deliveredUpdate.error.message)) {
        return NextResponse.json({ error: deliveredUpdate.error.message }, { status: 500 })
      }

      // Mark incoming messages as read when the thread is opened by receiver.
      const readUpdate = await db
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("product_id", productId)
        .eq("receiver_email", auth.email)
        .eq("sender_email", valid.peer)
        .is("read_at", null)

      // Backward compatibility: if read_at column does not exist, ignore this step.
      if (readUpdate.error && !/read_at/i.test(readUpdate.error.message)) {
        return NextResponse.json({ error: readUpdate.error.message }, { status: 500 })
      }

      const { data, error } = await db
        .from("messages")
        .select("*")
        .eq("product_id", productId)
        .or(
          `and(sender_email.eq."${auth.email}",receiver_email.eq."${valid.peer}"),and(sender_email.eq."${valid.peer}",receiver_email.eq."${auth.email}")`
        )
        .order("created_at", { ascending: true })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const rawMessages = (data ?? []) as MsgRow[]
      const messages = await enrichMessagesWithUsernames(db, rawMessages)

      return NextResponse.json({
        product_title: valid.productTitle,
        owner_email: valid.ownerEmail,
        peer_email: valid.peer,
        messages,
      })
    }

    const deliveredUpdate = await db
      .from("messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("receiver_email", auth.email)
      .eq("sender_email", peerEmail)
      .is("delivered_at", null)

    if (deliveredUpdate.error && !/delivered_at/i.test(deliveredUpdate.error.message)) {
      return NextResponse.json({ error: deliveredUpdate.error.message }, { status: 500 })
    }

    const readUpdate = await db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("receiver_email", auth.email)
      .eq("sender_email", peerEmail)
      .is("read_at", null)

    if (readUpdate.error && !/read_at/i.test(readUpdate.error.message)) {
      return NextResponse.json({ error: readUpdate.error.message }, { status: 500 })
    }

    const { data, error } = await db
      .from("messages")
      .select("*")
      .or(
        `and(sender_email.eq."${auth.email}",receiver_email.eq."${peerEmail}"),and(sender_email.eq."${peerEmail}",receiver_email.eq."${auth.email}")`
      )
      .order("created_at", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rawMessages = (data ?? []) as MsgRow[]
    const messages = await enrichMessagesWithUsernames(db, rawMessages)

    return NextResponse.json({
      product_title: null,
      owner_email: null,
      peer_email: peerEmail,
      messages,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const rawBody = await request.json().catch(() => null)
    const body = asObject(rawBody)
    const productId = asTrimmedString(body.product_id)
    const peerEmail = asTrimmedString(body.peer_email).toLowerCase()
    const text = asTrimmedString(body.message)

    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product_id" }, { status: 400 })
    }
    if (!text || text.length < 2) {
      return NextResponse.json({ error: "Mesaj en az 2 karakter olmali" }, { status: 400 })
    }
    if (text.length > 1000) {
      return NextResponse.json({ error: "Mesaj en fazla 1000 karakter olmali" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)
    const valid = await validateThreadParticipants(db, productId, auth.email, peerEmail)
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: valid.status })
    }

    const { data, error } = await db
      .from("messages")
      .insert({
        product_id: productId,
        product_title: valid.productTitle,
        sender_user_id: auth.userId,
        sender_email: auth.email,
        receiver_email: valid.peer,
        text,
      })
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: data }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
