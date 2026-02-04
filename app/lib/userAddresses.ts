export type SavedAddress = {
  id: string
  fullName: string
  phone: string
  city: string
  district: string
  addressLine: string
  createdAt: string
}

function keyForUser(userKey: string) {
  return `ebeveyn_saved_addresses:${userKey}`
}

function safeString(value: unknown) {
  return String(value || "").trim()
}

function normalize(item: unknown): SavedAddress | null {
  if (!item || typeof item !== "object") return null
  const src = item as Record<string, unknown>
  const id = safeString(src.id)
  const fullName = safeString(src.fullName)
  const phone = safeString(src.phone)
  const city = safeString(src.city)
  const district = safeString(src.district)
  const addressLine = safeString(src.addressLine)
  const createdAt = safeString(src.createdAt)

  if (!id || !fullName || !phone || !city || !district || !addressLine) return null

  return {
    id,
    fullName,
    phone,
    city,
    district,
    addressLine,
    createdAt: createdAt || new Date().toISOString(),
  }
}

export function getSavedAddresses(userKey: string) {
  if (typeof window === "undefined") return [] as SavedAddress[]
  const key = safeString(userKey)
  if (!key) return [] as SavedAddress[]

  try {
    const raw = window.localStorage.getItem(keyForUser(key))
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : []
    if (!Array.isArray(parsed)) return [] as SavedAddress[]
    return parsed
      .map(normalize)
      .filter((x): x is SavedAddress => Boolean(x))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return [] as SavedAddress[]
  }
}

export function upsertSavedAddress(
  userKey: string,
  payload: Omit<SavedAddress, "id" | "createdAt"> & { id?: string }
) {
  if (typeof window === "undefined") return [] as SavedAddress[]
  const key = safeString(userKey)
  if (!key) return [] as SavedAddress[]

  const next: SavedAddress = {
    id: safeString(payload.id) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fullName: safeString(payload.fullName),
    phone: safeString(payload.phone),
    city: safeString(payload.city),
    district: safeString(payload.district),
    addressLine: safeString(payload.addressLine),
    createdAt: new Date().toISOString(),
  }

  if (!next.fullName || !next.phone || !next.city || !next.district || !next.addressLine) {
    return getSavedAddresses(key)
  }

  const existing = getSavedAddresses(key)
  const filtered = existing.filter((x) => x.id !== next.id)
  const merged = [next, ...filtered].slice(0, 10)
  window.localStorage.setItem(keyForUser(key), JSON.stringify(merged))
  return merged
}

export function removeSavedAddress(userKey: string, addressId: string) {
  if (typeof window === "undefined") return [] as SavedAddress[]
  const key = safeString(userKey)
  const id = safeString(addressId)
  if (!key || !id) return getSavedAddresses(key)

  const existing = getSavedAddresses(key)
  const next = existing.filter((x) => x.id !== id)
  window.localStorage.setItem(keyForUser(key), JSON.stringify(next))
  return next
}
