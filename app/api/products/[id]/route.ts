import { NextResponse } from "next/server"
import { createAnonClient, createServiceRoleClient } from "@/app/lib/supabaseServer"
import { asTrimmedString, isUuid } from "@/app/lib/validation"

function supabaseAnon() {
  return createAnonClient()
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params
    const id = asTrimmedString(rawId)

    if (!isUuid(id)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    }

    const supabase = supabaseAnon()

    let { data, error } = await supabase
      .from("products")
      .select("id,title,daily_price,image_url,image_urls,description,tags,features,created_at,owner_email,view_count")
      .eq("id", id)
      .single()

    if (error && /view_count/i.test(error.message)) {
      const fallback = await supabase
        .from("products")
        .select("id,title,daily_price,image_url,image_urls,description,tags,features,created_at,owner_email")
        .eq("id", id)
        .single()
      data = fallback.data ? { ...fallback.data, view_count: 0 } : null
      error = fallback.error
    }

    if (error && /image_urls/i.test(error.message)) {
      const fallback = await supabase
        .from("products")
        .select("id,title,daily_price,image_url,description,tags,features,created_at,owner_email,view_count")
        .eq("id", id)
        .single()
      data = fallback.data
        ? {
            ...fallback.data,
            image_urls: fallback.data.image_url ? [fallback.data.image_url] : [],
          }
        : null
      error = fallback.error
      if (error && /view_count/i.test(error.message)) {
        const fallbackNoView = await supabase
          .from("products")
          .select("id,title,daily_price,image_url,description,tags,features,created_at,owner_email")
          .eq("id", id)
          .single()
        data = fallbackNoView.data
          ? {
              ...fallbackNoView.data,
              image_urls: fallbackNoView.data.image_url ? [fallbackNoView.data.image_url] : [],
              view_count: 0,
            }
          : null
        error = fallbackNoView.error
      }
    }

    if (error || !data) {
      return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 })
    }

    return NextResponse.json({ product: data }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatası"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params
    const id = asTrimmedString(rawId)
    if (!isUuid(id)) return NextResponse.json({ error: "Gecersiz id" }, { status: 400 })

    // Preferred: call SECURITY DEFINER RPC so increment works without exposing service key.
    const anon = createAnonClient()
    const rpc = await anon.rpc("increment_product_view", { p_product_id: id })
    if (!rpc.error) return NextResponse.json({ ok: true, via: "rpc" }, { status: 200 })

    if (/function .*increment_product_view/i.test(rpc.error.message)) {
      // Backward compatibility: fallback to direct update if service role key exists.
      let db: ReturnType<typeof createServiceRoleClient> | null = null
      try {
        db = createServiceRoleClient()
      } catch {
        db = null
      }

      if (!db) {
        return NextResponse.json(
          { ok: false, skipped: "missing_rpc_and_service_role" },
          { status: 200 }
        )
      }

      const { data: existing, error: readError } = await db
        .from("products")
        .select("id,view_count")
        .eq("id", id)
        .single()

      if (readError) {
        if (/view_count/i.test(readError.message)) {
          return NextResponse.json({ ok: true, skipped: "view_count_missing" }, { status: 200 })
        }
        return NextResponse.json({ error: readError.message }, { status: 500 })
      }

      const current = Number((existing as { view_count?: number | null })?.view_count ?? 0)
      const { error: updateError } = await db
        .from("products")
        .update({ view_count: current + 1 })
        .eq("id", id)

      if (updateError) {
        if (/view_count/i.test(updateError.message)) {
          return NextResponse.json({ ok: true, skipped: "view_count_missing" }, { status: 200 })
        }
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, via: "service_role" }, { status: 200 })
    }

    if (/view_count/i.test(rpc.error.message)) {
      return NextResponse.json({ ok: true, skipped: "view_count_missing" }, { status: 200 })
    }

    return NextResponse.json({ error: rpc.error.message }, { status: 500 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
