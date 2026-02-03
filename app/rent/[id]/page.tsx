import { redirect } from "next/navigation"

type Props = {
  params: Promise<{ id: string }>
}

export default async function RentPage({ params }: Props) {
  const { id } = await params
  const safeId = encodeURIComponent(String(id || "").trim())
  redirect(`/product/${safeId}`)
}
