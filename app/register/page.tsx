"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Button from "../components/Button"
import { useAuth } from "../context/AuthContext"
import { supabase } from "../lib/supabaseClient"

const OTP_COOLDOWN_SECONDS = 60

export default function RegisterPage() {
  const router = useRouter()
  const { sendSignUpOtp, completeSignUpWithOtp, resendSignUpOtp, isLoggedIn, loading } = useAuth()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("")
  const [step, setStep] = useState<"form" | "verify">("form")
  const [busy, setBusy] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  useEffect(() => {
    if (!loading && isLoggedIn) {
      router.replace("/")
      return
    }
  }, [isLoggedIn, loading, router])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [avatarPreviewUrl])

  function isGmailAddress(value: string) {
    return /^[^\s@]+@gmail\.com$/i.test(value.trim())
  }

  function normalizeUsername(value: string) {
    return value.trim().toLowerCase()
  }

  function isValidUsername(value: string) {
    return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value))
  }

  function parseRateLimitSeconds(message: string) {
    const match = message.match(/(\d+)\s*(second|seconds|saniye)/i)
    if (!match) return OTP_COOLDOWN_SECONDS
    const seconds = Number(match[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : OTP_COOLDOWN_SECONDS
  }

  function isRateLimitError(message: string) {
    return /rate limit|too fast attempt|security purposes/i.test(message)
  }

  function getFriendlyRateLimitMessage(message: string) {
    const wait = parseRateLimitSeconds(message)
    setResendCooldown(wait)
    return `Cok hizli deneme yapildi. Lutfen ${wait} saniye bekleyip tekrar deneyin.`
  }

  async function uploadAvatarAfterVerify(file: File) {
    const ext = file.name.split(".").pop() || "jpg"
    const path = `avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)

    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    const avatarUrl = String(data.publicUrl || "").trim()
    if (!avatarUrl) throw new Error("Profil fotografi URL alinmadi.")

    const session = (await supabase.auth.getSession()).data.session
    const token = session?.access_token
    if (!token) throw new Error("Oturum bulunamadi.")

    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        avatar_url: avatarUrl,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error || "Profil fotografi kaydedilemedi.")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setInfo("")
    setBusy(true)

    const cleanEmail = email.trim().toLowerCase()
    const cleanUsername = normalizeUsername(username)
    if (!isGmailAddress(cleanEmail)) {
      setError("Lutfen gecerli bir Gmail adresi girin.")
      setBusy(false)
      return
    }
    if (!isValidUsername(cleanUsername)) {
      setError("Kullanici adi 3-20 karakter olmali; sadece kucuk harf, rakam ve _ kullanin.")
      setBusy(false)
      return
    }

    const res = await sendSignUpOtp(cleanEmail, password, cleanUsername)
    if (!res.ok) {
      const msg = res.error || "Kayit basarisiz."
      if (isRateLimitError(msg)) {
        setStep("verify")
        setInfo(
          `${getFriendlyRateLimitMessage(
            msg
          )} Daha once gelen kodu girerek kaydi tamamlayabilirsiniz.`
        )
        setBusy(false)
        return
      }
      setError(msg)
      setBusy(false)
      return
    }

    setStep("verify")
    setResendCooldown(OTP_COOLDOWN_SECONDS)
    setInfo("Dogrulama kodu Gmail adresinize gonderildi. Lutfen kodu girin.")
    setBusy(false)
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setInfo("")
    setBusy(true)

    const cleanCode = otpCode.trim()
    if (!cleanCode) {
      setError("Lutfen Gmail adresinize gelen kodu girin.")
      setBusy(false)
      return
    }
    if (!/^\d{8}$/.test(cleanCode)) {
      setError("Kod 8 haneli sayi olmalidir.")
      setBusy(false)
      return
    }

    const res = await completeSignUpWithOtp(email.trim().toLowerCase(), cleanCode, normalizeUsername(username))
    if (!res.ok) {
      setError(res.error || "Kod dogrulanamadi.")
      setBusy(false)
      return
    }

    if (avatarFile) {
      try {
        await uploadAvatarAfterVerify(avatarFile)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Profil fotografi yuklenemedi."
        setInfo(`Kayit tamamlandi, ancak profil fotografi yuklenemedi: ${message}`)
      }
    }

    setInfo("Kayit tamamlandi.")
    await new Promise((resolve) => setTimeout(resolve, 500))
    router.push("/")
  }

  async function handleResendCode() {
    setError("")
    setInfo("")
    if (resendCooldown > 0) {
      setError(`Lutfen ${resendCooldown} saniye bekleyin.`)
      return
    }
    setBusy(true)

    const res = await resendSignUpOtp(email.trim().toLowerCase())
    if (!res.ok) {
      const msg = res.error || "Kod tekrar gonderilemedi."
      if (isRateLimitError(msg)) {
        setInfo(
          `${getFriendlyRateLimitMessage(
            msg
          )} Bu sirada gelen kodu girerek dogrulamayi tamamlayabilirsiniz.`
        )
        setBusy(false)
        return
      }
      setError(msg)
      setBusy(false)
      return
    }

    setResendCooldown(OTP_COOLDOWN_SECONDS)
    setInfo("Yeni kod Gmail adresinize gonderildi.")
    setBusy(false)
  }

  function handleAvatarChange(file: File | null) {
    setAvatarFile(file)
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    if (!file) {
      setAvatarPreviewUrl("")
      return
    }
    setAvatarPreviewUrl(URL.createObjectURL(file))
  }

  return (
    <main className="container-app flex justify-center">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-3xl font-extrabold mb-2">Kayit Ol</h1>
        <p className="text-muted mb-6">
          {step === "form"
            ? "Gmail adresin ve sifrenle kayit ol."
            : "Gmail adresine gelen kodu girerek kaydi tamamla."}
        </p>

        {step === "form" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Gmail adresi"
            />
            <input
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              type="text"
              placeholder="Kullanici adi (orn: ebeveyn_anne34)"
            />
            <p className="text-xs text-muted">3-20 karakter: kucuk harf, rakam, alt cizgi (_)</p>
            <div>
              <p className="mb-2 text-sm font-semibold">Profil fotografi (istege bagli)</p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
              />
              {avatarPreviewUrl ? (
                <div className="relative mt-3 h-16 w-16 overflow-hidden rounded-full border">
                  <Image src={avatarPreviewUrl} alt="Profil fotografi onizleme" fill className="object-cover" sizes="64px" />
                </div>
              ) : null}
            </div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Sifre (min 6)"
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
              {busy ? "Gonderiliyor..." : "Kayit Ol"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <input value={email} type="email" disabled />
            <input value={normalizeUsername(username)} type="text" disabled />
            {avatarFile ? <p className="text-xs text-muted">Profil fotografisi secildi.</p> : null}
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              inputMode="numeric"
              maxLength={8}
              pattern="[0-9]{8}"
              placeholder="E-posta dogrulama kodu"
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
              {busy ? "Dogrulaniyor..." : "Kodu Dogrula"}
            </Button>

            <button
              type="button"
              className="w-full rounded-2xl border px-4 py-2 text-sm"
              onClick={handleResendCode}
              disabled={busy || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Tekrar gonder (${resendCooldown}s)` : "Kodu Tekrar Gonder"}
            </button>
          </form>
        )}

        <p className="text-sm text-muted mt-6 text-center">
          Zaten hesabin var mi? <a className="underline font-semibold" href="/login">Giris Yap</a>
        </p>
      </div>
    </main>
  )
}
