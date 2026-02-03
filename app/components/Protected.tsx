"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../context/AuthContext"

type ProtectedProps = {
  children: React.ReactNode
  nextPath?: string
  warningText?: string
}

export default function Protected({
  children,
  nextPath = "/",
  warningText = "Bu sayfayi gormek icin lutfen giris yapin.",
}: ProtectedProps) {
  const { isLoggedIn } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`)
    }
  }, [isLoggedIn, nextPath, router])

  if (!isLoggedIn) {
    return (
      <div className="p-10">
        <div className="max-w-xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          {warningText}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
