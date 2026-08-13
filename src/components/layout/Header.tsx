"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Menu, X, ChevronDown, Wrench, LogOut, User, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils"
import { cn } from "@/lib/utils"

const services = [
  { label: "MOT Test", href: "/search?service=MOT" },
  { label: "Full Service", href: "/search?service=FULL_SERVICE" },
  { label: "Interim Service", href: "/search?service=INTERIM_SERVICE" },
  { label: "Brakes", href: "/search?service=BRAKES" },
  { label: "Tyres", href: "/search?service=TYRES" },
  { label: "Engine Repair", href: "/search?service=REPAIR" },
  { label: "Diagnostics", href: "/search?service=DIAGNOSTICS" },
  { label: "Clutch", href: "/search?service=CLUTCH" },
  { label: "Cambelt", href: "/search?service=CAMBELT" },
  { label: "Exhaust", href: "/search?service=EXHAUST" },
  { label: "Battery", href: "/search?service=BATTERY" },
  { label: "Air Con", href: "/search?service=AIR_CON" },
]

export function Header() {
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)

  const user = session?.user as any

  const getDashboardLink = () => {
    if (user?.role === "ADMIN") return "/admin"
    if (user?.role === "GARAGE") return "/garage-dashboard"
    return "/dashboard"
  }

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 20px rgba(0,0,0,0.05)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-transform duration-200 group-hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" }}
            >
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold text-[#1E3A5F] tracking-tight">
              Quote<span className="text-[#F97316]">MyGarage</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            <Link
              href="/search"
              className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors"
            >
              Find a Garage
            </Link>

            {/* Services Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setServicesOpen(true)}
              onMouseLeave={() => setServicesOpen(false)}
            >
              <button className="flex items-center gap-1 px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                Services
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", servicesOpen && "rotate-180")} />
              </button>

              {servicesOpen && (
                /* pt-1 creates visual gap inside the absolute div so mouse never leaves the container */
                <div className="absolute top-full left-0 w-52 pt-1 z-50">
                  <div
                    className="rounded-2xl py-2"
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid rgba(0,0,0,0.07)",
                      boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)",
                    }}
                  >
                    <div className="px-3 pb-2 mb-1 border-b border-slate-50">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        All Services
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-0.5 px-2">
                      {services.map((s) => (
                        <Link
                          key={s.href}
                          href={s.href}
                          className="px-2 py-1.5 text-[12px] font-medium text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/how-it-works"
              className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors"
            >
              How It Works
            </Link>

            <Link
              href="/for-garages"
              className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors"
            >
              For Garages
            </Link>
          </nav>

          {/* Desktop Auth */}
          <div className="hidden lg:flex items-center gap-2.5">
            {session ? (
              <div className="flex items-center gap-2.5">
                <Link href={getDashboardLink()}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 cursor-pointer p-1 rounded-xl hover:bg-slate-50 transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
                      <AvatarFallback className="text-xs">{getInitials(user?.name ?? "U")}</AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                  <div
                    className="absolute right-0 top-full w-48 py-2 mt-2 rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid rgba(0,0,0,0.07)",
                      boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
                    }}
                  >
                    <div className="px-4 py-2 border-b border-slate-50 mb-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{user?.name}</p>
                      <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                    </div>
                    <Link
                      href={getDashboardLink()}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <User className="h-4 w-4" />
                      My Account
                    </Link>
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Link href="/login">
                  <button className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                    Sign In
                  </button>
                </Link>
                <Link href="/garage-register">
                  <button
                    className="px-4 py-2 text-[13px] font-bold text-white rounded-xl transition-all duration-200 hover:opacity-90 cursor-pointer"
                    style={{
                      background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                      boxShadow: "0 2px 10px rgba(249, 115, 22, 0.3)",
                    }}
                  >
                    List Your Garage
                  </button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="lg:hidden"
          style={{
            borderTop: "1px solid rgba(0,0,0,0.06)",
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="px-4 py-3 space-y-0.5">
            <Link
              href="/search"
              className="block px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
              onClick={() => setMobileOpen(false)}
            >
              Find a Garage
            </Link>

            {/* Mobile Services accordion */}
            <div>
              <button
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl cursor-pointer"
                onClick={() => setServicesOpen(!servicesOpen)}
              >
                Services
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", servicesOpen && "rotate-180")} />
              </button>
              {servicesOpen && (
                <div className="mx-2 mt-1 mb-1 rounded-xl bg-slate-50 border border-slate-100 grid grid-cols-2">
                  {services.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="px-3 py-2 text-[13px] text-slate-600 hover:text-[#1E3A5F] hover:bg-slate-100 rounded-lg transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/how-it-works"
              className="block px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </Link>
            <Link
              href="/for-garages"
              className="block px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
              onClick={() => setMobileOpen(false)}
            >
              For Garages
            </Link>
            <div className="pt-2 border-t border-slate-100 space-y-2">
              {session ? (
                <>
                  <Link href={getDashboardLink()} onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" className="w-full">Dashboard</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full text-red-600"
                    onClick={() => { signOut({ callbackUrl: "/" }); setMobileOpen(false) }}
                  >
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">Sign In</Button>
                  </Link>
                  <Link href="/garage-register" onClick={() => setMobileOpen(false)}>
                    <button
                      className="w-full py-2.5 text-sm font-bold text-white rounded-xl"
                      style={{ background: "linear-gradient(135deg, #F97316, #EA580C)" }}
                    >
                      List Your Garage
                    </button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
