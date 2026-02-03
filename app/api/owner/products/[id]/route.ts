import { NextResponse } from "next/server"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asTrimmedString, isUuid } from "@/app/lib/validation"

async function requireAuthenticatedUser(request: Request) {
  const authClient = createAnonClient()
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return { ok: false as const, error: "Token eksik" }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return { ok: false as const, error: "Gecersiz token" }

  const email = (data.user.email || "").trim().toLowerCase()
  if (!email) return { ok: false as const, error: "Kullanici e-posta bilgisi bulunamadi" }

  return { ok: true as const, token, email }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createAnonClient()
  const { id: rawId } = await ctx.params
  const id = asTrimmedString(rawId)
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Gecersiz id" }, { status: 400 })
  }

  const { data, error } = await supabase.from("products").select("*").eq("id", id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ product: data })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const { id: rawId } = await ctx.params
    const id = asTrimmedString(rawId)
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Gecersiz id" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)
    const { data: product, error: findError } = await db
      .from("products")
      .select("id,owner_email")
      .eq("id", id)
      .single()

    if (findError || !product) {
      return NextResponse.json({ error: "Ilan bulunamadi" }, { status: 404 })
    }

    if (!product.owner_email) {
      return NextResponse.json(
        { error: "Bu ilanda sahip bilgisi eksik oldugu icin silme islemi engellendi" },
        { status: 403 }
      )
    }

    if (String(product.owner_email).toLowerCase() !== auth.email) {
      return NextResponse.json({ error: "Bu ilani silme yetkiniz yok" }, { status: 403 })
    }

    const { error: deleteError } = await db.from("products").delete().eq("id", id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
