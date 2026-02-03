import { NextResponse } from "next/server"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isHttpUrl } from "@/app/lib/validation"

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(value)
}

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const email = asTrimmedString(url.searchParams.get("email")).toLowerCase()
    const userId = asTrimmedString(url.searchParams.get("user_id"))
    const username = normalizeUsername(asTrimmedString(url.searchParams.get("username")))

    const db = createAnonClient()
    const applyFilter = <T extends { eq: (a: string, b: string) => T }>(q: T) => {
      if (email) return q.eq("email", email)
      if (userId) return q.eq("user_id", userId)
      if (username) return q.eq("username", username)
      return q
    }

    if (!email && !userId && !username) {
      return NextResponse.json({ error: "email, user_id veya username gerekli" }, { status: 400 })
    }

    let { data, error } = await applyFilter(
      db.from("profiles").select("user_id,email,username,avatar_url,created_at,updated_at").limit(1)
    ).maybeSingle()

    // Backward compatibility for profiles table without avatar_url column.
    if (error && /avatar_url/i.test(error.message)) {
      const fallback = await applyFilter(
        db.from("profiles").select("user_id,email,username,created_at,updated_at").limit(1)
      ).maybeSingle()
      data = fallback.data ? { ...fallback.data, avatar_url: null } : null
      error = fallback.error
    }
    if (error) {
      if (/relation .*profiles.* does not exist/i.test(error.message)) {
        return NextResponse.json(
          { error: "Profiles tablosu yok. SQL adimlarini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data ?? null })
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
    const usernameRaw = asTrimmedString(body.username)
    const username = normalizeUsername(usernameRaw)
    const avatarRaw = asTrimmedString(body.avatar_url)

    if (!username && !avatarRaw) {
      return NextResponse.json({ error: "username veya avatar_url gerekli." }, { status: 400 })
    }
    if (avatarRaw && !isHttpUrl(avatarRaw)) {
      return NextResponse.json({ error: "avatar_url gecerli bir http(s) URL olmalidir." }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)
    let { data: existing } = await db
      .from("profiles")
      .select("username,avatar_url")
      .eq("user_id", auth.userId)
      .maybeSingle()

    if (!existing) {
      const fallbackExisting = await db
        .from("profiles")
        .select("username")
        .eq("user_id", auth.userId)
        .maybeSingle()
      if (fallbackExisting.data) {
        existing = { ...fallbackExisting.data, avatar_url: null }
      }
    }

    const resolvedUsername = username || normalizeUsername(asTrimmedString(existing?.username))

    if (!isValidUsername(resolvedUsername)) {
      return NextResponse.json(
        { error: "Kullanici adi 3-20 karakter olmali; sadece kucuk harf, rakam ve _ kullanin." },
        { status: 400 }
      )
    }

    const payload: {
      user_id: string
      email: string
      username: string
      avatar_url?: string | null
      updated_at: string
    } = {
      user_id: auth.userId,
      email: auth.email,
      username: resolvedUsername,
      updated_at: new Date().toISOString(),
    }
    if ("avatar_url" in body) {
      payload.avatar_url = avatarRaw || null
    }

    let { data, error } = await db
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,email,username,avatar_url")
      .single()

    // Backward compatibility for profiles table without avatar_url column.
    if (error && /avatar_url/i.test(error.message)) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.avatar_url
      const fallback = await db
        .from("profiles")
        .upsert(fallbackPayload, { onConflict: "user_id" })
        .select("user_id,email,username")
        .single()
      data = fallback.data ? { ...fallback.data, avatar_url: null } : null
      error = fallback.error
    }

    if (error) {
      if (/duplicate key value/i.test(error.message) || /profiles_username_key/i.test(error.message)) {
        return NextResponse.json({ error: "Bu kullanici adi zaten alinmis." }, { status: 409 })
      }
      if (/relation .*profiles.* does not exist/i.test(error.message)) {
        return NextResponse.json(
          { error: "Profiles tablosu yok. SQL adimlarini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile: data }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
