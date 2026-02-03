"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "../context/AuthContext"

type Item = {
  href: string
  label: string
}

function NavItem({ href, label }: Item) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <Link
      href={href}
      className={`block rounded-lg border px-3 py-2 text-sm ${
        active ? "border-black bg-black text-white" : "bg-white"
      }`}
    >
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const { user, loading } = useAuth()

  return (
    <aside className="w-full md:w-64">
      <div className="sticky top-4 rounded-2xl border bg-white/80 p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Menu</div>
        <div className="space-y-2">
          <NavItem href="/" label="Ana Sayfa" />
          {loading ? null : user ? (
            <>
              <NavItem href="/profile" label="Profil" />
              <NavItem href="/rentals" label="Kiralamalarim" />
            </>
          ) : (
            <>
              <NavItem href="/login" label="Giris Yap" />
              <NavItem href="/register" label="Kayit Ol" />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
