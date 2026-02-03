import Protected from "@/app/components/Protected"
import ProductDetailClient from "./ProductDetailClient"

type ParamsLike = { id?: string }

export default async function ProductPage({
  params,
}: {
  // Next 16 dev/turbopack bazen Promise donebiliyor
  params: ParamsLike | Promise<ParamsLike>
}) {
  const resolved = await Promise.resolve(params)

  const raw = (resolved?.id ?? "").toString()
  const id = decodeURIComponent(raw).trim()
  const safeId = encodeURIComponent(id)

  return (
    <Protected
      nextPath={`/product/${safeId}`}
      warningText="Urun sayfasina erismek icin once giris yapmalisiniz."
    >
      <ProductDetailClient id={id} />
    </Protected>
  )
}
