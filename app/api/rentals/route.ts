import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { normalizeRentalStatus, type RentalStatus } from "@/app/lib/rentals"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isUuid } from "@/app/lib/validation"

type RentalRow = {
  status?: unknown
} & Record<string, unknown>

function toIsoDate(value: unknown): string | null {
  const s = asTrimmedString(value)
  if (!s) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

async function getAuthFromRequest(req: Request) {
  const authClient = createAnonClient()

  const auth = req.headers.get("authorization") || ""
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (bearerToken) {
    const { data, error } = await authClient.auth.getUser(bearerToken)
    if (!error && data?.user) return { user: data.user, accessToken: bearerToken }
  }

  const cookieStore = await cookies()
  const accessToken = cookieStore.get("sb-access-token")?.value
  if (!accessToken) return null

  const { data, error } = await authClient.auth.getUser(accessToken)
  if (error || !data?.user) return null
  return { user: data.user, accessToken }
}

export async function GET(req: Request) {
  try {
    const authData = await getAuthFromRequest(req)
    if (!authData) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 })
    }

    const supabase = createUserTokenClient(authData.accessToken)

    const { data, error } = await supabase
      .from("rentals")
      .select("*")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rentals = ((data ?? []) as RentalRow[]).map((item) => ({
      ...item,
      status:
        normalizeRentalStatus(String(item?.status ?? "")) ??
        String(item?.status ?? ""),
    }))

    return NextResponse.json({ rentals })
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const authData = await getAuthFromRequest(req)
    if (!authData) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 })
    }

    const rawBody = await req.json().catch(() => ({}))
    const body = asObject(rawBody)
    const product_id = asTrimmedString(body.product_id)
    const start_date = toIsoDate(body.start_date)
    const end_date = toIsoDate(body.end_date)

    if (!product_id) {
      return NextResponse.json({ error: "product_id gerekli" }, { status: 400 })
    }
    if (!isUuid(product_id)) {
      return NextResponse.json({ error: "Geçersiz product_id" }, { status: 400 })
    }
    if (!start_date || !end_date) {
      return NextResponse.json({ error: "start_date ve end_date gerekli" }, { status: 400 })
    }

    const supabase = createUserTokenClient(authData.accessToken)

    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .select("id,title,daily_price,owner_email")
      .eq("id", product_id)
      .single()

    if (prodErr || !prod) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 })
    }

    const startMs = Date.parse(`${start_date}T00:00:00Z`)
    const endMs = Date.parse(`${end_date}T00:00:00Z`)
    const dayDiff = Math.floor((endMs - startMs) / 86400000) + 1
    if (!Number.isFinite(dayDiff) || dayDiff <= 0) {
      return NextResponse.json({ error: "Geçersiz tarih araligi" }, { status: 400 })
    }

    const insertPayload: {
      user_id: string
      product_id: string
      product_title: string
      daily_price: number
      start_date: string
      end_date: string
      days: number
      total: number
      status: RentalStatus
      owner_email?: string | null
    } = {
      user_id: authData.user.id,
      product_id: prod.id,
      product_title: prod.title,
      daily_price: prod.daily_price,
      start_date,
      end_date,
      days: dayDiff,
      total: prod.daily_price * dayDiff,
      status: "pending",
      owner_email: prod.owner_email ?? null,
    }

    let insertResult = await supabase
      .from("rentals")
      .insert(insertPayload)
      .select("*")
      .single()

    // Backward compatibility for schemas without owner_email.
    if (insertResult.error && /owner_email/i.test(insertResult.error.message)) {
      const fallbackPayload = { ...insertPayload }
      delete fallbackPayload.owner_email
      insertResult = await supabase
        .from("rentals")
        .insert(fallbackPayload)
        .select("*")
        .single()
    }

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 })
    }

    // Best-effort in-app notification to the product owner via messages.
    // If messages table/policies are missing, rental creation should still succeed.
    const ownerEmail = String(prod.owner_email || "").trim().toLowerCase()
    const renterEmail = String(authData.user.email || "").trim().toLowerCase()
    if (ownerEmail && renterEmail && ownerEmail !== renterEmail) {
      const notifyText = `Yeni kiralama talebi: ${prod.title} (${start_date} - ${end_date})`
      const notifyInsert = await supabase.from("messages").insert({
        product_id: prod.id,
        product_title: prod.title,
        sender_user_id: authData.user.id,
        sender_email: renterEmail,
        receiver_email: ownerEmail,
        text: notifyText,
      })

      if (
        notifyInsert.error &&
        !/relation .*messages.* does not exist|column .* does not exist|row-level security|permission denied/i.test(
          notifyInsert.error.message
        )
      ) {
        // Ignore known notification-related setup errors, surface unknown ones for diagnostics.
        console.warn("Rental notification insert warning:", notifyInsert.error.message)
      }
    }

    return NextResponse.json({
      rental: {
        ...insertResult.data,
        status:
          normalizeRentalStatus(String(insertResult.data?.status ?? "")) ??
          String(insertResult.data?.status ?? ""),
      },
    })
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}
