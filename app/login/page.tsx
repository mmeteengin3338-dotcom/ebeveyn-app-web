"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Button from "../components/Button"
import { useAuth } from "../context/AuthContext"

function LoginForm() {
  const router = useRouter()
  const { signIn, isLoggedIn, loading } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!loading && isLoggedIn) {
      router.replace("/")
    }
  }, [isLoggedIn, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const res = await signIn(email.trim(), password, rememberMe)
    if (!res.ok) {
      setError(res.error || "Giris basarisiz.")
      return
    }

    router.replace("/")
  }

  return (
    <main className="container-app flex justify-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-extrabold mb-2">Giris Yap</h1>
        <p className="text-muted mb-6">Devam etmek icin giris yap.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-posta" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Sifre" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Beni hatirla
          </label>

          {error && (
            <div className="text-sm bg-red-500/15 border border-red-500/30 text-red-700 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full">Giris Yap</Button>
        </form>

        <p className="text-sm text-center mt-3">
          <a className="underline font-semibold" href="/forgot-password">Sifremi unuttum</a>
        </p>

        <p className="text-sm text-muted mt-6 text-center">
          Hesabin yok mu? <a className="underline font-semibold" href="/register">Kayit Ol</a>
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="container-app p-8">Yukleniyor...</main>}>
      <LoginForm />
    </Suspense>
  )
}
