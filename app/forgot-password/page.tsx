"use client"

import { useState } from "react"
import Button from "../components/Button"
import { supabase } from "../lib/supabaseClient"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setInfo("")
    setBusy(true)

    const cleanEmail = email.trim().toLowerCase()
    const origin = window.location.origin
    const redirectTo = `${origin}/reset-password`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    })

    if (resetError) {
      setError(resetError.message || "Sifirlama maili gonderilemedi.")
      setBusy(false)
      return
    }

    setInfo("Sifre yenileme linki e-posta adresinize gonderildi.")
    setBusy(false)
  }

  return (
    <main className="container-app flex justify-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-extrabold mb-2">Sifremi Unuttum</h1>
        <p className="text-muted mb-6">E-posta adresinizi girin, sifre yenileme linki gonderelim.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="E-posta"
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
            {busy ? "Gonderiliyor..." : "Sifirlama Maili Gonder"}
          </Button>
        </form>
      </div>
    </main>
  )
}
