export type StoredProduct = {
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

const CART_KEY = "ebeveyn_cart_products_v1"
const FAVORITES_KEY = "ebeveyn_favorite_products_v1"

function canUseStorage() {
  return typeof window !== "undefined"
}

function sanitizeProduct(raw: unknown): StoredProduct | null {
  if (!raw || typeof raw !== "object") return null
  const src = raw as Record<string, unknown>
  const id = String(src.id || "").trim()
  const title = String(src.title || "").trim()
  const dailyPrice = Number(src.daily_price)
  if (!id || !title || !Number.isFinite(dailyPrice)) return null

  const imageUrl = String(src.image_url || "").trim()
  const imageUrls = Array.isArray(src.image_urls)
    ? src.image_urls
        .map((u) => String(u || "").trim())
        .filter((u) => u.length > 0)
    : []

  return {
    id,
    title,
    daily_price: dailyPrice,
    image_url: imageUrl || null,
    image_urls: imageUrls,
    description: String(src.description || "").trim() || null,
    tags: Array.isArray(src.tags)
      ? src.tags.map((t) => String(t || "").trim()).filter((t) => t.length > 0)
      : [],
    owner_email: String(src.owner_email || "").trim() || null,
    owner_username: String(src.owner_username || "").trim() || null,
    owner_avatar_url: String(src.owner_avatar_url || "").trim() || null,
  }
}

function readList(key: string): StoredProduct[] {
  if (!canUseStorage()) return []
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitizeProduct).filter((item): item is StoredProduct => Boolean(item))
  } catch {
    return []
  }
}

function writeList(key: string, list: StoredProduct[]) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(list))
}

function emit(eventName: "cart-updated" | "favorites-updated") {
  if (!canUseStorage()) return
  window.dispatchEvent(new Event(eventName))
}

export function getCartProducts() {
  return readList(CART_KEY)
}

export function getFavoriteProducts() {
  return readList(FAVORITES_KEY)
}

export function getCartCount() {
  return getCartProducts().length
}

export function getFavoriteCount() {
  return getFavoriteProducts().length
}

export function isInCart(productId: string) {
  const id = String(productId || "").trim()
  if (!id) return false
  return getCartProducts().some((item) => item.id === id)
}

export function isFavorite(productId: string) {
  const id = String(productId || "").trim()
  if (!id) return false
  return getFavoriteProducts().some((item) => item.id === id)
}

export function addToCart(product: StoredProduct) {
  const next = sanitizeProduct(product)
  if (!next) return false

  const list = getCartProducts()
  if (list.some((item) => item.id === next.id)) return false
  writeList(CART_KEY, [next, ...list])
  emit("cart-updated")
  return true
}

export function removeFromCart(productId: string) {
  const id = String(productId || "").trim()
  if (!id) return
  const list = getCartProducts().filter((item) => item.id !== id)
  writeList(CART_KEY, list)
  emit("cart-updated")
}

export function toggleFavorite(product: StoredProduct) {
  const next = sanitizeProduct(product)
  if (!next) return false

  const list = getFavoriteProducts()
  const exists = list.some((item) => item.id === next.id)
  const updated = exists ? list.filter((item) => item.id !== next.id) : [next, ...list]
  writeList(FAVORITES_KEY, updated)
  emit("favorites-updated")
  return !exists
}

export function removeFavorite(productId: string) {
  const id = String(productId || "").trim()
  if (!id) return
  const list = getFavoriteProducts().filter((item) => item.id !== id)
  writeList(FAVORITES_KEY, list)
  emit("favorites-updated")
}
