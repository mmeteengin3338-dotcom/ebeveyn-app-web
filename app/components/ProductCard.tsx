"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  addToCart,
  isFavorite,
  isInCart,
  toggleFavorite,
  type StoredProduct,
} from "@/app/lib/localCollections"

type Product = StoredProduct

export default function ProductCard({
  product,
  variant = "home",
}: {
  product: Product
  variant?: "home" | "profile"
}) {
  const realId = String(product?.id ?? "").trim()
  const safeId = encodeURIComponent(realId)
  const productHref = `/product/${safeId}`
  const profileHandle = (product.owner_username || product.owner_email || "").trim()
  const profileHref = profileHandle
    ? `/profile/${encodeURIComponent(profileHandle)}`
    : null

  const [inCart, setInCart] = useState(false)
  const [favorite, setFavorite] = useState(false)

  const firstGalleryImage = Array.isArray(product?.image_urls)
    ? product.image_urls.find((u) => String(u || "").trim().length > 0)
    : null

  const imageSrc =
    firstGalleryImage ||
    (product?.image_url && product.image_url.trim().length > 0
      ? product.image_url
      : "/products/placeholder.jpg")

  const imageHeightClass = variant === "profile" ? "h-64" : "h-56"

  const normalizedProduct = useMemo<StoredProduct>(
    () => ({
      id: realId,
      title: String(product.title || "").trim(),
      daily_price: Number(product.daily_price || 0),
      image_url: product.image_url || null,
      image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
      description: product.description || null,
      tags: Array.isArray(product.tags) ? product.tags : [],
      owner_email: product.owner_email || null,
      owner_username: product.owner_username || null,
      owner_avatar_url: product.owner_avatar_url || null,
    }),
    [
      realId,
      product.daily_price,
      product.description,
      product.image_url,
      product.image_urls,
      product.owner_avatar_url,
      product.owner_email,
      product.owner_username,
      product.tags,
      product.title,
    ]
  )

  useEffect(() => {
    function refresh() {
      setInCart(isInCart(realId))
      setFavorite(isFavorite(realId))
    }

    refresh()
    window.addEventListener("cart-updated", refresh)
    window.addEventListener("favorites-updated", refresh)

    return () => {
      window.removeEventListener("cart-updated", refresh)
      window.removeEventListener("favorites-updated", refresh)
    }
  }, [realId])

  function onAddToCart() {
    if (inCart) return
    const added = addToCart(normalizedProduct)
    if (added) setInCart(true)
  }

  function onToggleFavorite() {
    const nowFavorite = toggleFavorite(normalizedProduct)
    setFavorite(nowFavorite)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-white shadow-md">
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorite ? "Favorilerden kaldir" : "Favorilere ekle"}
        className={`absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border text-xl transition ${
          favorite
            ? "border-pink-400 bg-pink-500 text-white shadow-md"
            : "border-black/15 bg-white/90 text-black/65 hover:border-pink-300 hover:text-pink-500"
        }`}
      >
        {favorite ? "♥" : "♡"}
      </button>

      <Link href={productHref} className="block">
        <div className={`relative w-full bg-gradient-to-br from-pink-50 to-rose-50 ${imageHeightClass}`}>
          <Image
            src={imageSrc}
            alt={product?.title || "Urun"}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      </Link>

      <div className="p-5">
        {profileHref && (product.owner_username || product.owner_avatar_url) ? (
          <Link href={profileHref} className="mb-3 inline-flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-full border bg-black/5">
              {product.owner_avatar_url ? (
                <Image
                  src={product.owner_avatar_url}
                  alt={product.owner_username || "Kullanici"}
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                  {(product.owner_username || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-black/70 hover:underline">
              {product.owner_username || "Profil"}
            </span>
          </Link>
        ) : null}

        <Link href={productHref}>
          <h3 className="line-clamp-1 text-xl font-bold text-black hover:underline">{product.title}</h3>
        </Link>

        <Link href={productHref} className="block">
          <p className="mt-2 line-clamp-2 text-sm text-black/70 hover:underline">
            {product.description || "Aciklama eklenmemis."}
          </p>
        </Link>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-semibold text-black">Gunluk: {product.daily_price} TL</span>

          <div className="flex items-center gap-2">
            {product.owner_email ? (
              <Link
                href={`/chats?product=${safeId}&peer=${encodeURIComponent(product.owner_email)}`}
                className="shrink-0"
              >
                <button className="rounded-xl border border-black/20 bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-black/5">
                  Mesaj Gonder
                </button>
              </Link>
            ) : null}

            <button
              type="button"
              onClick={onAddToCart}
              disabled={inCart}
              className={`shrink-0 rounded-xl border px-4 py-2 font-semibold transition ${
                inCart
                  ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-black/20 bg-pink-300 text-black hover:bg-pink-400"
              }`}
            >
              {inCart ? "Sepette" : "Sepete Ekle"}
            </button>
          </div>
        </div>

        {product.tags && product.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {product.tags.slice(0, 3).map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-xs text-black"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
