"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import ProductCard from "../components/ProductCard"
import {
  getCartProducts,
  removeFromCart,
  type StoredProduct,
} from "../lib/localCollections"

export default function CartPage() {
  const [items, setItems] = useState<StoredProduct[]>([])

  useEffect(() => {
    function refresh() {
      setItems(getCartProducts())
    }

    refresh()
    window.addEventListener("cart-updated", refresh)

    return () => {
      window.removeEventListener("cart-updated", refresh)
    }
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-200 via-pink-100 to-pink-200 p-6">
      <div className="mx-auto max-w-[1760px]">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold">Sepetim</h1>
            <p className="text-black/60">Sepete ekledigin urunler burada listelenir.</p>
          </div>
          <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold">
            {items.length} urun
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((product) => (
              <div key={product.id} className="space-y-2">
                <ProductCard product={product} variant="home" />
                <button
                  type="button"
                  onClick={() => removeFromCart(product.id)}
                  className="w-full rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-black/5"
                >
                  Sepetten Cikar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
