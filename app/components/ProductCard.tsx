import Image from "next/image"
import Link from "next/link"

type Product = {
  id: string
  title: string
  daily_price: number
  image_url?: string | null
  image_urls?: string[] | null
  description?: string | null
  tags?: string[] | null
  owner_email?: string | null
  owner_username?: string | null
  owner_avatar_url?: string | null
}

export default function ProductCard({
  product,
  variant = "home",
}: {
  product: Product
  variant?: "home" | "profile"
}) {
  const realId = String(product?.id ?? "").trim()
  const safeId = encodeURIComponent(realId)
  const profileHandle = (product.owner_username || product.owner_email || "").trim()
  const profileHref = profileHandle
    ? `/profile/${encodeURIComponent(profileHandle)}`
    : null

  const firstGalleryImage = Array.isArray(product?.image_urls)
    ? product.image_urls.find((u) => String(u || "").trim().length > 0)
    : null
  const imageSrc = firstGalleryImage || (product?.image_url && product.image_url.trim().length > 0
      ? product.image_url
      : "/products/placeholder.jpg")
  const imageHeightClass = variant === "profile" ? "h-64" : "h-56"

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-md">
      {profileHref ? (
        <Link href={profileHref} className="block">
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
      ) : (
        <div className={`relative w-full bg-gradient-to-br from-pink-50 to-rose-50 ${imageHeightClass}`}>
          <Image
            src={imageSrc}
            alt={product?.title || "Urun"}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      )}

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

        {profileHref ? (
          <Link href={profileHref}>
            <h3 className="line-clamp-1 text-xl font-bold text-black hover:underline">{product.title}</h3>
          </Link>
        ) : (
          <h3 className="line-clamp-1 text-xl font-bold text-black">{product.title}</h3>
        )}

        <p className="mt-2 line-clamp-2 text-sm text-black/70">
          {product.description || "Aciklama eklenmemis."}
        </p>

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

            <Link href={`/product/${safeId}`} className="shrink-0">
              <button className="rounded-xl border border-black/20 bg-pink-300 px-4 py-2 font-semibold text-black transition hover:bg-pink-400">
                Urunu Incele
              </button>
            </Link>
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
