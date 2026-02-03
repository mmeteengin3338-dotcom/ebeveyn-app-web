import { NextResponse } from "next/server"
import { createAnonClient } from "@/app/lib/supabaseServer"

function supabaseAnon() {
  return createAnonClient()
}

export async function GET(request: Request) {
  try {
    const supabase = supabaseAnon()
    const url = new URL(request.url)
    const ownerEmail = String(url.searchParams.get("owner_email") || "").trim().toLowerCase()

    const runQuery = async (selectColumns: string) => {
      const query = supabase
        .from("products")
        .select(selectColumns)
        .order("created_at", { ascending: false })
      return ownerEmail ? await query.eq("owner_email", ownerEmail) : await query
    }

    let { data, error } = await runQuery(
      "id,title,daily_price,image_url,description,tags,features,created_at,owner_email,view_count"
    )
    if (error && /view_count/i.test(error.message)) {
      const fallback = await runQuery(
        "id,title,daily_price,image_url,description,tags,features,created_at,owner_email"
      )
      data = (fallback.data ?? []).map((p) => ({ ...p, view_count: 0 }))
      error = fallback.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const products = data ?? []
    const ownerEmails = Array.from(
      new Set(
        products
          .map((p) => String(p.owner_email || "").trim().toLowerCase())
          .filter((v) => v.length > 0)
      )
    )

    let profileByEmail = new Map<string, { username: string | null; avatar_url: string | null }>()
    if (ownerEmails.length > 0) {
      let { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("email,username,avatar_url")
        .in("email", ownerEmails)

      // Backward compatibility for profiles table without avatar_url column.
      if (profileError && /avatar_url/i.test(profileError.message)) {
        const fallback = await supabase
          .from("profiles")
          .select("email,username")
          .in("email", ownerEmails)
        profileRows = fallback.data
        profileError = fallback.error
      }

      if (!profileError && Array.isArray(profileRows)) {
        profileByEmail = new Map(
          profileRows
            .map((row) => [
              String(row.email || "").toLowerCase(),
              {
                username: row.username ? String(row.username) : null,
                avatar_url: row.avatar_url ? String(row.avatar_url) : null,
              },
            ] as const)
            .filter(([email]) => email.length > 0)
        )
      }
    }

    const enriched = products.map((p) => {
      const email = String(p.owner_email || "").toLowerCase()
      const profile = profileByEmail.get(email)
      return {
        ...p,
        owner_username: profile?.username || null,
        owner_avatar_url: profile?.avatar_url || null,
      }
    })

    return NextResponse.json({ products: enriched }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatası"
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
