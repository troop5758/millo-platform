"use client"

import Link from "next/link"

const links = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/live", label: "Live" },
  { href: "/admin", label: "Admin" },
]

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#252B33] bg-[#111418]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-semibold tracking-tight">
          Millo
        </div>

        <nav className="flex items-center gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 rounded-xl text-sm text-[#A7B0BA] hover:text-white hover:bg-[#171B21] transition"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
