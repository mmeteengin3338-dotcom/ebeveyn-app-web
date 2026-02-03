"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Button from "../components/Button"
import { supabase } from "../lib/supabaseClient"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        setReady(true)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === "PASSWORD_RECOVERY" || !!session) {
        setReady(true)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setInfo("")
    setBusy(true)

    if (!ready) {
      setError("Gecerli bir sifre yenileme linki ile bu sayfayi acin.")
      setBusy(false)
      return
    }
    if (password.length < 6) {
      setError("Sifre en az 6 karakter olmali.")
      setBusy(false)
      return
    }
    if (password !== confirm) {
      setError("Sifreler eslesmiyor.")
      setBusy(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message || "Sifre guncellenemedi.")
      setBusy(false)
      return
    }

    setInfo("Sifreniz guncellendi. Giris sayfasina yonlendiriliyorsunuz.")
    setTimeout(() => router.push("/login"), 900)
  }

  return (
    <main className="container-app flex justify-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-extrabold mb-2">Sifre Yenile</h1>
        <p className="text-muted mb-6">Yeni sifrenizi belirleyin.</p>

        {!ready ? (
          <div className="text-sm bg-yellow-500/15 border border-yellow-500/30 text-yellow-800 rounded-2xl px-4 py-3">
            Link dogrulamasi bekleniyor. E-postadaki linkten bu sayfaya geldiginizden emin olun.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Yeni sifre (min 6)"
          />
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            placeholder="Yeni sifre tekrar"
          />

          {error && (
            <div className="text-sm bg-red-500/15 border border-red-500/30 text-red-700 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm bg-green-500/15 border border-green-500/30 text-green-700 rounded-2xl px-4 py-3">
              {info}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Kaydediliyor..." : "Sifreyi Guncelle"}
          </Button>
        </form>
      </div>
    </main>
  )
}
