import { NextResponse } from "next/server"
import { createAnonClient, createUserTokenClient } from "@/app/lib/supabaseServer"
import { asObject, asTrimmedString, isUuid } from "@/app/lib/validation"

type ProductCommentRow = {
  id: string
  product_id: string
  user_id: string
  user_email: string
  comment_text: string
  created_at: string
  username?: string | null
  avatar_url?: string | null
}

type ProfileRow = {
  user_id?: string | null
  username?: string | null
  avatar_url?: string | null
}

function isMissingCommentsTableError(message: string) {
  return /relation .*product_comments.* does not exist/i.test(message)
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

async function enrichCommentsWithProfiles(
  db: ReturnType<typeof createAnonClient>,
  comments: ProductCommentRow[]
) {
  const userIds = Array.from(
    new Set(
      comments
        .map((comment) => String(comment.user_id || ""))
        .filter((id) => id.length > 0)
    )
  )

  if (userIds.length === 0) return comments

  let { data: profileRows, error: profileError } = await db
    .from("profiles")
    .select("user_id,username,avatar_url")
    .in("user_id", userIds)

  if (profileError && /avatar_url/i.test(profileError.message)) {
    const fallback = await db
      .from("profiles")
      .select("user_id,username")
      .in("user_id", userIds)
    profileRows = fallback.data ? fallback.data.map((row) => ({ ...row, avatar_url: null })) : null
    profileError = fallback.error
  }

  if (profileError || !Array.isArray(profileRows)) return comments

  const profileByUserId = new Map(
    (profileRows as ProfileRow[])
      .map((row) => [String(row.user_id || ""), row] as const)
      .filter(([userId]) => userId.length > 0)
  )

  return comments.map((comment) => {
    const profile = profileByUserId.get(String(comment.user_id || ""))
    return {
      ...comment,
      username: profile?.username ? String(profile.username) : null,
      avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
    }
  })
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params
    const productId = asTrimmedString(rawId)

    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product id" }, { status: 400 })
    }

    const db = createAnonClient()
    const { data, error } = await db
      .from("product_comments")
      .select("id,product_id,user_id,user_email,comment_text,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })

    if (error) {
      if (isMissingCommentsTableError(error.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const comments = await enrichCommentsWithProfiles(
      db,
      (Array.isArray(data) ? data : []) as ProductCommentRow[]
    )

    return NextResponse.json({ comments }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const { id: rawId } = await ctx.params
    const productId = asTrimmedString(rawId)

    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product id" }, { status: 400 })
    }

    const rawBody = await request.json().catch(() => null)
    const body = asObject(rawBody)
    const commentText = asTrimmedString(body.comment_text)

    if (commentText.length < 2) {
      return NextResponse.json({ error: "Yorum en az 2 karakter olmali" }, { status: 400 })
    }
    if (commentText.length > 500) {
      return NextResponse.json({ error: "Yorum en fazla 500 karakter olmali" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)

    const { data: product, error: productError } = await db
      .from("products")
      .select("id")
      .eq("id", productId)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Urun bulunamadi" }, { status: 404 })
    }

    const { data: inserted, error: insertError } = await db
      .from("product_comments")
      .insert({
        product_id: productId,
        user_id: auth.userId,
        user_email: auth.email,
        comment_text: commentText,
      })
      .select("id,product_id,user_id,user_email,comment_text,created_at")
      .single()

    if (insertError) {
      if (isMissingCommentsTableError(insertError.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      if (/row-level security/i.test(insertError.message)) {
        return NextResponse.json(
          { error: "Yorum ekleme izni yok. product_comments INSERT policy kontrol edin." },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const [comment] = await enrichCommentsWithProfiles(db, [inserted as ProductCommentRow])
    return NextResponse.json({ comment }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const { id: rawId } = await ctx.params
    const productId = asTrimmedString(rawId)
    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product id" }, { status: 400 })
    }

    const rawBody = await request.json().catch(() => null)
    const body = asObject(rawBody)
    const commentId = asTrimmedString(body.comment_id)
    const commentText = asTrimmedString(body.comment_text)

    if (!isUuid(commentId)) {
      return NextResponse.json({ error: "Gecersiz comment_id" }, { status: 400 })
    }
    if (commentText.length < 2 || commentText.length > 500) {
      return NextResponse.json({ error: "Yorum 2-500 karakter olmali" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)

    const { data: existing, error: existingError } = await db
      .from("product_comments")
      .select("id,user_id")
      .eq("id", commentId)
      .eq("product_id", productId)
      .single()

    if (existingError || !existing) {
      if (existingError && isMissingCommentsTableError(existingError.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: "Yorum bulunamadi" }, { status: 404 })
    }

    if (String(existing.user_id || "") !== auth.userId) {
      return NextResponse.json(
        { error: "Sadece kendi yorumunuzu duzenleyebilirsiniz." },
        { status: 403 }
      )
    }

    const { data: updated, error: updateError } = await db
      .from("product_comments")
      .update({ comment_text: commentText })
      .eq("id", commentId)
      .eq("product_id", productId)
      .select("id,product_id,user_id,user_email,comment_text,created_at")
      .single()

    if (updateError || !updated) {
      if (updateError && isMissingCommentsTableError(updateError.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      if (updateError && /row-level security/i.test(updateError.message)) {
        return NextResponse.json(
          { error: "Yorum guncelleme izni yok. product_comments UPDATE policy kontrol edin." },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: updateError?.message || "Yorum guncellenemedi" },
        { status: 500 }
      )
    }

    const [comment] = await enrichCommentsWithProfiles(db, [updated as ProductCommentRow])
    return NextResponse.json({ comment }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const { id: rawId } = await ctx.params
    const productId = asTrimmedString(rawId)
    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Gecersiz product id" }, { status: 400 })
    }

    const rawBody = await request.json().catch(() => null)
    const body = asObject(rawBody)
    const commentId = asTrimmedString(body.comment_id)

    if (!isUuid(commentId)) {
      return NextResponse.json({ error: "Gecersiz comment_id" }, { status: 400 })
    }

    const db = createUserTokenClient(auth.token)

    const { data: existing, error: existingError } = await db
      .from("product_comments")
      .select("id,user_id")
      .eq("id", commentId)
      .eq("product_id", productId)
      .single()

    if (existingError || !existing) {
      if (existingError && isMissingCommentsTableError(existingError.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: "Yorum bulunamadi" }, { status: 404 })
    }

    if (String(existing.user_id || "") !== auth.userId) {
      return NextResponse.json(
        { error: "Sadece kendi yorumunuzu silebilirsiniz." },
        { status: 403 }
      )
    }

    const { error: deleteError } = await db
      .from("product_comments")
      .delete()
      .eq("id", commentId)
      .eq("product_id", productId)

    if (deleteError) {
      if (isMissingCommentsTableError(deleteError.message)) {
        return NextResponse.json(
          { error: "product_comments tablosu yok. Supabase SQL adimini uygulayin." },
          { status: 500 }
        )
      }
      if (/row-level security/i.test(deleteError.message)) {
        return NextResponse.json(
          { error: "Yorum silme izni yok. product_comments DELETE policy kontrol edin." },
          { status: 403 }
        )
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, comment_id: commentId }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Sunucu hatasi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
