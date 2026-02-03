"use client"

import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabaseClient"

type BasicUser = {
  id: string
  email: string | null
} | null

const REMEMBER_ME_KEY = "ebeveyn_remember_me"
const SESSION_LOGIN_KEY = "ebeveyn_session_login"

export type AuthContextType = {
  user: BasicUser
  loading: boolean
  isLoggedIn: boolean
  userEmail: string | null
  userId: string | null
  signIn: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<{ ok: boolean; error?: string }>
  sendSignUpOtp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ ok: boolean; error?: string }>
  completeSignUpWithOtp: (
    email: string,
    token: string,
    username: string
  ) => Promise<{ ok: boolean; error?: string }>
  resendSignUpOtp: (email: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) === "1"
      const sessionLogin = sessionStorage.getItem(SESSION_LOGIN_KEY) === "1"

      // If "remember me" is off and this is a fresh browser session, clear persisted auth.
      if (!rememberMe && !sessionLogin) {
        await supabase.auth.signOut()
      }

      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const u = data.session?.user ?? null
      setUserEmail(u?.email ?? null)
      setUserId(u?.id ?? null)
      setLoading(false)
    }

    init().catch(() => {
      if (!mounted) return
      setUserEmail(null)
      setUserId(null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUserEmail(u?.email ?? null)
      setUserId(u?.id ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextType>(() => {
    const user: BasicUser = userId ? { id: userId, email: userEmail } : null

    return {
      user,
      loading,
      isLoggedIn: !!userId,
      userEmail,
      userId,

      signIn: async (email: string, password: string, rememberMe = false) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { ok: false, error: error.message }
        if (rememberMe) {
          localStorage.setItem(REMEMBER_ME_KEY, "1")
          sessionStorage.removeItem(SESSION_LOGIN_KEY)
        } else {
          localStorage.setItem(REMEMBER_ME_KEY, "0")
          sessionStorage.setItem(SESSION_LOGIN_KEY, "1")
        }
        return { ok: true }
      },

      sendSignUpOtp: async (email: string, password: string, username: string) => {
        const normalizedUsername = username.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
          return {
            ok: false,
            error: "Kullanici adi 3-20 karakter olmali; sadece kucuk harf, rakam ve _ kullanin.",
          }
        }

        const checkRes = await fetch(
          `/api/usernames/check?username=${encodeURIComponent(normalizedUsername)}`,
          { cache: "no-store" }
        )
        const checkJson = (await checkRes.json().catch(() => ({}))) as {
          available?: boolean
          error?: string
        }
        if (!checkRes.ok) {
          return { ok: false, error: checkJson.error || "Kullanici adi kontrol edilemedi." }
        }
        if (!checkJson.available) {
          return { ok: false, error: "Bu kullanici adi zaten alinmis." }
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: normalizedUsername,
            },
          },
        })
        if (error) return { ok: false, error: error.message }

        if (!data.user) {
          return { ok: false, error: "Kayit baslatilamadi. Lutfen tekrar deneyin." }
        }

        // Supabase may return an obfuscated user for existing accounts.
        if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
          return {
            ok: false,
            error: "Bu e-posta zaten kayitli. Lutfen giris yapin veya sifrenizi sifirlayin.",
          }
        }

        if (data.user.email_confirmed_at) {
          return {
            ok: false,
            error: "Bu e-posta zaten dogrulanmis bir hesaba ait. Lutfen giris yapin.",
          }
        }

        if (!data.user.confirmation_sent_at) {
          return {
            ok: false,
            error:
              "Dogrulama e-postasi gonderilemedi. Supabase Email ayarlarinizi (Provider, Confirm email, template) kontrol edin.",
          }
        }

        // If session exists, email verification is not required in project settings.
        if (data.session) {
          return {
            ok: false,
            error:
              "E-posta dogrulama su an projede zorunlu degil. Supabase Auth ayarlarindan Confirm email ozelligini acin.",
          }
        }

        localStorage.setItem(`pending_signup_username:${email.toLowerCase()}`, normalizedUsername)
        return { ok: true }
      },
      completeSignUpWithOtp: async (email: string, token: string, username: string) => {
        const normalizedEmail = email.trim().toLowerCase()
        const normalizedUsername =
          username.trim().toLowerCase() ||
          localStorage.getItem(`pending_signup_username:${normalizedEmail}`) ||
          ""
        const verify = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token,
          type: "signup",
        })
        if (verify.error) return { ok: false, error: verify.error.message }

        const tokenFromVerify = verify.data.session?.access_token
        const tokenFromSession = (await supabase.auth.getSession()).data.session?.access_token
        const accessToken = tokenFromVerify || tokenFromSession
        if (!accessToken) {
          return {
            ok: false,
            error:
              "Kayit dogrulandi ama oturum acilamadi. Lutfen giris yapip profilinden kullanici adi belirleyin.",
          }
        }

        const claimRes = await fetch("/api/profiles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ username: normalizedUsername }),
        })
        const claimJson = (await claimRes.json().catch(() => ({}))) as { error?: string }
        if (!claimRes.ok) {
          return { ok: false, error: claimJson.error || "Kullanici adi kaydedilemedi." }
        }

        localStorage.removeItem(`pending_signup_username:${normalizedEmail}`)
        return { ok: true }
      },
      resendSignUpOtp: async (email: string) => {
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      },

      signOut: async () => {
        localStorage.removeItem(REMEMBER_ME_KEY)
        sessionStorage.removeItem(SESSION_LOGIN_KEY)
        await supabase.auth.signOut()
      },
    }
  }, [loading, userEmail, userId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
