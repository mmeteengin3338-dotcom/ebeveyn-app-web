export type RentalStatus = "pending" | "approved" | "rejected" | "completed"

export type Rental = {
  id: string
  product_id: string
  product_title: string
  daily_price: number
  status: RentalStatus
  created_at: string
  user_id?: string
  owner_email?: string | null
}

export const rentalStatusLabelTr: Record<RentalStatus, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  completed: "Tamamlandı",
}

export function normalizeRentalStatus(raw: string): RentalStatus | null {
  const v = raw.trim().toLowerCase()
  if (v === "pending" || v === "bekliyor") return "pending"
  if (v === "approved" || v === "onaylandi" || v === "onaylandı") return "approved"
  if (v === "rejected" || v === "reddedildi") return "rejected"
  if (v === "completed" || v === "tamamlandi" || v === "tamamlandı") return "completed"
  return null
}

export function rentalStatusVariants(status: RentalStatus): string[] {
  if (status === "pending") return ["pending", "Bekliyor", "bekliyor"]
  if (status === "approved") return ["approved", "Onaylandi", "onaylandi", "Onaylandı", "onaylandı"]
  if (status === "rejected") return ["rejected", "Reddedildi", "reddedildi"]
  return ["completed", "Tamamlandi", "tamamlandi", "Tamamlandı", "tamamlandı"]
}
