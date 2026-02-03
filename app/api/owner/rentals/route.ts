import { NextResponse } from "next/server"
import {
  normalizeRentalStatus,
  rentalStatusVariants,
  type RentalStatus,
} from "@/app/lib/rentals"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isUuid } from "@/app/lib/validation"

type RentalRow = {
  id: string
  product_id: string
  owner_email?: string | null
  status?: unknown
} & Record<string, unknown>

type ProductOwnerRow = {
  id: string
}

async function getOwnerAuth(request: Request) {
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return null

  const authClient = createAnonClient()
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user || !data.user.email) return null

  return { user: data.user, token }
}

export async function GET(request: Request) {
  const authData = await getOwnerAuth(request)
  if (!authData) {
    return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = normalizeRentalStatus(url.searchParams.get("status") || "pending")
  if (!status) return NextResponse.json({ error: "Gecersiz status" }, { status: 400 })

  const supabase = createUserTokenClient(authData.token)
  let { data, error } = await supabase
    .from("rentals")
    .select("*")
    .eq("owner_email", authData.user.email)
    .in("status", rentalStatusVariants(status))
    .order("created_at", { ascending: false })

  // Backward compatibility for schemas where rentals.owner_email does not exist.
  if (error && /owner_email/i.test(error.message)) {
    const { data: ownerProducts, error: ownerProductsError } = await supabase
      .from("products")
      .select("id")
      .eq("owner_email", authData.user.email)

    if (ownerProductsError) {
      return NextResponse.json({ error: ownerProductsError.message }, { status: 500 })
    }

    const productIds = ((ownerProducts ?? []) as ProductOwnerRow[])
      .map((p) => p.id)
      .filter(Boolean)

    if (productIds.length === 0) {
      return NextResponse.json({ rentals: [] })
    }

    const fallback = await supabase
      .from("rentals")
      .select("*")
      .in("product_id", productIds)
      .in("status", rentalStatusVariants(status))
      .order("created_at", { ascending: false })

    data = fallback.data
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rentals = ((data ?? []) as RentalRow[]).map((item) => ({
    ...item,
    status:
      normalizeRentalStatus(String(item?.status ?? "")) ??
      String(item?.status ?? ""),
  }))

  return NextResponse.json({ rentals })
}

export async function PATCH(request: Request) {
  const authData = await getOwnerAuth(request)
  if (!authData) {
    return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 })
  }

  const rawBody = await request.json().catch(() => null)
  const body = asObject(rawBody)
  const id = asTrimmedString(body.id)
  const status = normalizeRentalStatus(asTrimmedString(body.status))

  if (!id || !status) {
    return NextResponse.json({ error: "id ve status zorunludur" }, { status: 400 })
  }
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Gecersiz id" }, { status: 400 })
  }

  const supabase = createUserTokenClient(authData.token)

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .select("*")
    .eq("id", id)
    .single()

  if (rentalError || !rental) {
    return NextResponse.json({ error: "Talep bulunamadi" }, { status: 404 })
  }

  let ownerOk = false
  if ((rental as RentalRow).owner_email) {
    ownerOk = (rental as RentalRow).owner_email === authData.user.email
  } else if ((rental as RentalRow).product_id) {
    const { data: prod } = await supabase
      .from("products")
      .select("owner_email")
      .eq("id", (rental as RentalRow).product_id)
      .single()
    ownerOk = !!prod?.owner_email && prod.owner_email === authData.user.email
  }

  if (!ownerOk) {
    return NextResponse.json({ error: "Bu islem icin yetkiniz yok" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("rentals")
    .update({ status: status as RentalStatus })
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
}
