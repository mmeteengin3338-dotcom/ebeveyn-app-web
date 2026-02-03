export type Product = {
  id: string
  title: string
  dailyPrice: number
  image: string
  description: string
  features: string[]
  tags: string[]
}

export const products: Product[] = [
  {
    id: "1",
    title: "Bebek Arabası",
    dailyPrice: 150,
    image: "/products/stroller.jpg",
    description: "Konforlu ve hafif bebek arabası. Şehir içi kullanım için ideal.",
    features: ["Hafif gövde", "Katlanabilir", "Geniş sepet", "Yıkanabilir kumaş"],
    tags: ["şehir", "seyahat", "bebek", "dışarı", "araba"],
  },
  {
    id: "2",
    title: "Oto Koltuğu",
    dailyPrice: 200,
    image: "/products/car-seat.jpg",
    description: "Güvenli oto koltuğu. 0-4 yaş aralığı için uygundur.",
    features: ["ISOFIX uyumlu", "Yan darbe koruma", "Ayarlanabilir başlık"],
    tags: ["araba", "seyahat", "güvenlik", "bebek"],
  },
  {
    id: "3",
    title: "Mama Sandalyesi",
    dailyPrice: 100,
    image: "/products/high-chair.jpg",
    description: "Kolay temizlenir mama sandalyesi. Katlanabilir tasarım.",
    features: ["Katlanır", "Kolay temizlik", "Emniyet kemeri"],
    tags: ["ev", "beslenme", "bebek", "pratik"],
  },
  {
    id: "4",
    title: "Bebek Yatağı",
    dailyPrice: 180,
    image: "/products/crib.jpg",
    description: "Ahşap bebek yatağı. Rahat ve sağlam.",
    features: ["Sağlam ahşap", "Hava alan tasarım", "Kolay kurulum"],
    tags: ["ev", "uyku", "bebek", "konfor"],
  },
]