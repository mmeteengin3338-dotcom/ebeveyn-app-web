"use client"

import Link from "next/link"
import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import ProductCard from "../components/ProductCard"
import {
  getCartProducts,
  removeFromCart,
  type StoredProduct,
} from "../lib/localCollections"

export default function CartPage() {
  const router = useRouter()
  const [items, setItems] = useState<StoredProduct[]>([])
  const [selectedId, setSelectedId] = useState<string>("")

  useEffect(() => {
    function refresh() {
      const list = getCartProducts()
      setItems(list)
      setSelectedId((prev) => {
        if (prev && list.some((item) => item.id === prev)) return prev
        return list[0]?.id || ""
      })
    }

    refresh()
    window.addEventListener("cart-updated", refresh)

    return () => {
      window.removeEventListener("cart-updated", refresh)
    }
  }, [])

  const selectedProduct = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  )

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
      <div className="mx-auto max-w-[1760px]">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold">Sepetim ({items.length} Urun)</h1>
            <p className="text-black/60">Sepete ekledigin urunleri buradan satin alma adimina gecirebilirsin.</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold">Sepetin su an bos.</p>
            <p className="mt-2 text-black/60">Ana sayfadan urunleri sepete ekleyebilirsin.</p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-xl border border-black/20 bg-pink-200 px-4 py-2 font-semibold transition hover:bg-pink-300"
            >
              Ana sayfaya don
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,360px]">
            <section className="space-y-4">
              {items.map((product) => {
                const selected = selectedId === product.id
                return (
                  <div
                    key={product.id}
                    className={`rounded-3xl border bg-white p-4 shadow-sm transition ${
                      selected ? "border-pink-300 ring-2 ring-pink-200" : "border-black/10"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSelectedId(product.id)}
                        className={`rounded-xl border px-3 py-1 text-sm font-semibold ${
                          selected
                            ? "border-pink-300 bg-pink-100 text-pink-700"
                            : "border-black/15 bg-white text-black/70 hover:bg-black/5"
                        }`}
                      >
                        {selected ? "Secili" : "Sec"}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/checkout?product=${encodeURIComponent(product.id)}`)}
                          className="rounded-xl border border-orange-300 bg-orange-400 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-500"
                        >
                          Satin Al
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(product.id)}
                          className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-black/5"
                        >
                          Sepetten Cikar
                        </button>
                      </div>
                    </div>
                    <ProductCard product={product} variant="home" />
                  </div>
                )
              })}
            </section>

            <aside className="h-fit rounded-3xl border border-black/10 bg-white p-5 shadow-sm xl:sticky xl:top-32">
              <h2 className="text-3xl font-bold tracking-tight">Sepet Ozeti</h2>
              {selectedProduct ? (
                <>
                  <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50 p-3">
                    <p className="text-sm text-black/60">Secili urun</p>
                    <p className="line-clamp-1 text-lg font-semibold">{selectedProduct.title}</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Ara toplam</span>
                      <span className="font-semibold">{selectedProduct.daily_price} TL / gun</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Kargo</span>
                      <span className="font-semibold text-emerald-600">Bedava</span>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <div className="flex items-center justify-between text-xl font-bold">
                      <span>Toplam</span>
                      <span className="text-orange-600">{selectedProduct.daily_price} TL+</span>
                    </div>
                    <p className="mt-1 text-xs text-black/55">Kesin tutar odeme adiminda secilen gun sayisina gore hesaplanir.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/checkout?product=${encodeURIComponent(selectedProduct.id)}`)}
                    className="mt-5 w-full rounded-2xl bg-orange-500 px-4 py-3 text-lg font-bold text-white transition hover:bg-orange-600"
                  >
                    Satin Al
                  </button>
                </>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
