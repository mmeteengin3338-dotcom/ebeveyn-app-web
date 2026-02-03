import { NextResponse } from "next/server"
import {
  createAnonClient,
  createServiceRoleClient,
  createUserTokenClient,
} from "@/app/lib/supabaseServer"
import {
  asNumber,
  asObject,
  asStringArray,
  asTrimmedString,
  isHttpUrl,
} from "@/app/lib/validation"

async function requireAuthenticatedUser(request: Request) {
  const authClient = createAnonClient()
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return { ok: false as const, error: "Token eksik" }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return { ok: false as const, error: "Gecersiz token" }

  const email = (data.user.email || "").trim().toLowerCase()
  if (!email) return { ok: false as const, error: "Kullanici e-posta bilgisi bulunamadi" }

  return { ok: true as const, userId: data.user.id, email }
}

export async function GET(request: Request) {
  try {
    const guard = await requireAuthenticatedUser(request)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 401 })

    const auth = request.headers.get("authorization") || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
    const dbClient = createUserTokenClient(token)

    const result = await dbClient
      .from("products")
      .select("*")
      .eq("owner_email", guard.email)
      .order("created_at", { ascending: false })

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
    return NextResponse.json({ products: result.data ?? [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireAuthenticatedUser(request)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 401 })

    const rawBody = await request.json().catch(() => null)
    const body = asObject(rawBody)

    const title = asTrimmedString(body.title)
    const daily_price = asNumber(body.daily_price)
    const image_url = asTrimmedString(body.image_url)
    const description = asTrimmedString(body.description)
    const tags = asStringArray(body.tags)
    const features = asStringArray(body.features)

    if (!title || !description) {
      return NextResponse.json({ error: "title ve description zorunludur" }, { status: 400 })
    }
    if (daily_price === null || daily_price <= 0) {
      return NextResponse.json({ error: "daily_price pozitif bir sayi olmalidir" }, { status: 400 })
    }
    if (!image_url || !isHttpUrl(image_url)) {
      return NextResponse.json({ error: "image_url gecerli bir http(s) URL olmalidir" }, { status: 400 })
    }

    const auth = request.headers.get("authorization") || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""

    // Prefer service role for stable inserts; fallback to user token when key is missing/misconfigured.
    let dbClient: ReturnType<typeof createServiceRoleClient> | ReturnType<typeof createUserTokenClient>
    let usedServiceRole = false
    try {
      dbClient = createServiceRoleClient()
      usedServiceRole = true
    } catch {
      dbClient = createUserTokenClient(token)
    }

    let insertResult = await dbClient
      .from("products")
      .insert({
        title,
        daily_price,
        image_url,
        description,
        tags,
        features,
        owner_email: guard.email,
      })
      .select("*")
      .single()

    // If service key is wrong (e.g. anon key set as service key), retry with user token + RLS policies.
    if (
      usedServiceRole &&
      insertResult.error &&
      /row-level security|permission denied/i.test(insertResult.error.message) &&
      token
    ) {
      insertResult = await createUserTokenClient(token)
        .from("products")
        .insert({
          title,
          daily_price,
          image_url,
          description,
          tags,
          features,
          owner_email: guard.email,
        })
        .select("*")
        .single()
    }

    if (insertResult.error) return NextResponse.json({ error: insertResult.error.message }, { status: 500 })
    return NextResponse.json({ product: insertResult.data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
