import "./globals.css"
import Navbar from "./components/Navbar"
import { AuthProvider } from "./context/AuthContext"

export const metadata = {
  title: "Ebeveyn",
  description: "Bebek ürünlerini güvenle kirala",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-pink-100 text-black">
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1 pt-6">{children}</main>
            <footer
              aria-hidden
              className="relative mt-10 h-[460px] overflow-hidden border-t border-pink-300/90 bg-gradient-to-r from-fuchsia-300 via-pink-400 to-rose-400"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_30%,rgba(255,255,255,0.28),transparent_36%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.22),transparent_34%)]" />
              <div className="absolute -left-28 bottom-4 h-80 w-[520px] rounded-[48%] bg-fuchsia-600/20 blur-sm" />
              <div className="absolute right-[-120px] bottom-0 h-96 w-[560px] rounded-[45%] bg-rose-600/25 blur-sm" />

              <svg
                viewBox="0 0 340 340"
                className="absolute left-24 top-14 h-[280px] w-[280px] rotate-[-20deg] text-black/45"
                fill="currentColor"
              >
                <ellipse cx="170" cy="170" rx="132" ry="42" />
                <ellipse cx="105" cy="165" rx="16" ry="9" fill="rgb(244 114 182 / 0.85)" />
                <ellipse cx="235" cy="176" rx="16" ry="9" fill="rgb(244 114 182 / 0.85)" />
                <circle cx="82" cy="252" r="58" />
                <circle cx="82" cy="252" r="36" fill="rgb(244 114 182 / 0.85)" />
                <path d="M182 140 C210 88, 208 45, 236 28 C266 10, 312 24, 321 59 C330 95, 312 130, 278 142 C249 152, 220 170, 198 201 Z" />
              </svg>

              <svg
                viewBox="0 0 260 520"
                className="absolute right-28 bottom-6 h-[340px] w-[170px] text-black/45"
                fill="none"
                stroke="currentColor"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M130 40 C96 56, 96 94, 130 108 C164 94, 164 56, 130 40 Z" fill="currentColor" stroke="none" />
                <rect x="58" y="112" width="144" height="68" rx="16" fill="currentColor" stroke="none" />
                <path d="M60 192 C44 224, 66 256, 60 294 L60 430 C60 470, 88 500, 128 500 L176 500 C216 500, 244 470, 244 430 L244 292 C238 256, 260 224, 244 192 C224 176, 80 176, 60 192 Z" fill="currentColor" stroke="none" />
              </svg>

              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-fuchsia-700/20 to-transparent" />
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
