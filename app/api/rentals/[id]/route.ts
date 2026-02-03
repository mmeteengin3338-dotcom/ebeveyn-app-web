import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { normalizeRentalStatus } from "@/app/lib/rentals"
import { createServiceRoleClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isUuid } from "@/app/lib/validation"

function getServiceClient() {
  return createServiceRoleClient()
}

async function getUserFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (bearerToken) {
    const supabase = getServiceClient()
    const { data, error } = await supabase.auth.getUser(bearerToken)
    if (!error && data?.user) return data.user
  }

  const cookieStore = await cookies()
  const accessToken = cookieStore.get("sb-access-token")?.value
  if (!accessToken) return null

  const supabase = getServiceClient()
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user) return null
  return data.user
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 })

    const { id: rawId } = await ctx.params
    const id = asTrimmedString(rawId)
    if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 })
    if (!isUuid(id)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })

    const rawBody = await req.json().catch(() => ({}))
    const body = asObject(rawBody)
    const status = normalizeRentalStatus(asTrimmedString(body.status))

    if (!status) {
      return NextResponse.json({ error: "Geçersiz status" }, { status: 400 })
    }

    const supabase = getServiceClient()

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select("*")
      .eq("id", id)
      .single()

    if (rentalError || !rental) {
      return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 })
    }

    let ownerOk = false

    if (rental.owner_email) {
      ownerOk = rental.owner_email === user.email
    } else {
      const { data: prod } = await supabase
        .from("products")
        .select("owner_email")
        .eq("id", rental.product_id)
        .single()
      ownerOk = !!prod?.owner_email && prod.owner_email === user.email
    }

    if (!ownerOk) {
      return NextResponse.json({ error: "Bu islem icin yetkiniz yok" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("rentals")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      rental: {
        ...data,
        status:
          normalizeRentalStatus(String(data?.status ?? "")) ??
          String(data?.status ?? ""),
      },
    })
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}
