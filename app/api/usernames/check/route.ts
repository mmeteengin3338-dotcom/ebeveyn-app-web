import { NextResponse } from "next/server"
import { createAnonClient } from "@/app/lib/supabaseServer"
import { asTrimmedString } from "@/app/lib/validation"

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(value)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const username = normalizeUsername(asTrimmedString(url.searchParams.get("username")))

    if (!isValidUsername(username)) {
      return NextResponse.json(
        {
          available: false,
          error: "Kullanici adi 3-20 karakter olmali; sadece kucuk harf, rakam ve _ kullanin.",
        },
        { status: 400 }
      )
    }

    const db = createAnonClient()
    const { data, error } = await db
      .from("profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle()

    if (error) {
      if (/relation .*profiles.* does not exist/i.test(error.message)) {
        return NextResponse.json(
          { available: false, error: "Profiles tablosu yok. SQL adimlarini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ available: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ available: !data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ available: false, error: message }, { status: 500 })
  }
}
