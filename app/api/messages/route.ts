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

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const url = new URL(request.url)
    const box = asTrimmedString(url.searchParams.get("box") || "inbox").toLowerCase()
    const db = createUserTokenClient(auth.token)

    // Mark messages as delivered when receiver fetches message boxes.
    const deliveredUpdate = await db
      .from("messages")
      .update({ delivered_at: new Date().toISOString() })
      .eq("receiver_email", auth.email)
      .is("delivered_at", null)

    // Backward compatibility: if delivered_at column does not exist, ignore this step.
    if (deliveredUpdate.error && !/delivered_at/i.test(deliveredUpdate.error.message)) {
      return NextResponse.json({ error: deliveredUpdate.error.message }, { status: 500 })
    }

    const query = db
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })

    const result =
      box === "outbox"
        ? await query.eq("sender_user_id", auth.userId)
        : box === "all"
          ? await query.or(
              `sender_user_id.eq.${auth.userId},receiver_email.eq."${auth.email}"`
            )
          : await query.eq("receiver_email", auth.email)

    if (result.error) {
      if (/relation .*messages.* does not exist/i.test(result.error.message)) {
        return NextResponse.json(
          { error: "Mesajlar tablosu eksik. Supabase'de messages tablosunu olusturun." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    const rawMessages = (result.data ?? []) as MsgRow[]
    const messages = await enrichMessagesWithUsernames(db, rawMessages)
    return NextResponse.json({ messages })
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

    const { data: product, error: productError } = await db
      .from("products")
      .select("id,title,owner_email")
      .eq("id", productId)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Ilan bulunamadi" }, { status: 404 })
    }

    const ownerEmail = asTrimmedString(product.owner_email).toLowerCase()
    if (!ownerEmail) {
      return NextResponse.json({ error: "Ilan sahibi bilgisi bulunamadi" }, { status: 400 })
    }
    if (ownerEmail === auth.email) {
      return NextResponse.json({ error: "Kendi ilaniniza mesaj gonderemezsiniz" }, { status: 400 })
    }

    const { data: inserted, error: insertError } = await db
      .from("messages")
      .insert({
        product_id: productId,
        product_title: asTrimmedString(product.title),
        sender_user_id: auth.userId,
        sender_email: auth.email,
        receiver_email: ownerEmail,
        text,
      })
      .select("*")
      .single()

    if (insertError) {
      if (/relation .*messages.* does not exist/i.test(insertError.message)) {
        return NextResponse.json(
          { error: "Mesajlar tablosu eksik. Supabase'de messages tablosunu olusturun." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ message: inserted }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
