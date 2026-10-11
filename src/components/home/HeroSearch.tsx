"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, Car, ChevronDown, Check, Star, Shield, TrendingDown, Zap } from "lucide-react"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/messages/en"

// Service codes (match /search?service=) with the emoji shown in the dropdown; the names come from the translations.
const services = [
  { value: "", icon: "" },
  { value: "MOT", icon: "🔍" },
  { value: "FULL_SERVICE", icon: "⚙️" },
  { value: "INTERIM_SERVICE", icon: "🔧" },
  { value: "BRAKES", icon: "🛑" },
  { value: "TYRES", icon: "⭕" },
  { value: "REPAIR", icon: "🔩" },
  { value: "DIAGNOSTICS", icon: "📊" },
  { value: "CLUTCH", icon: "⚙️" },
  { value: "CAMBELT", icon: "🔄" },
  { value: "EXHAUST", icon: "💨" },
  { value: "BATTERY", icon: "🔋" },
  { value: "WINDSCREEN", icon: "🪟" },
  { value: "AIR_CON", icon: "❄️" },
] as const

const popularSearches = ["MOT", "FULL_SERVICE", "BRAKES", "TYRES", "DIAGNOSTICS"] as const

export function HeroSearch() {
  const t = useT()
  const router = useRouter()
  const [registration, setRegistration] = useState("")
  const [location, setLocation] = useState("")
  const [serviceType, setServiceType] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!location) return
    setLoading(true)
    const params = new URLSearchParams()
    if (location) params.set("location", location)
    if (registration) params.set("reg", registration)
    if (serviceType) params.set("service", serviceType)
    router.push(`/search?${params.toString()}`)
  }

  return (
    <section
      className="relative overflow-hidden min-h-[620px] flex items-center"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 35%, #1a3055 65%, #1e3a5f 100%)" }}
    >
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow blobs */}
      <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-10 right-1/4 w-[300px] h-[300px] bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-20 left-10 w-[200px] h-[200px] bg-blue-400/8 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* LEFT — Copy + Search */}
          <div>
            {/* Rating pill */}
            <div className="inline-flex items-center gap-2.5 bg-white/8 backdrop-blur-md border border-white/12 rounded-full px-4 py-2 mb-7">
              <Check className="h-4 w-4 text-emerald-400" aria-hidden />
              <span className="text-white/90 text-sm font-medium">{t("hero.badge")}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-5 tracking-tight">
              {t("hero.title1")}
              <br />
              <span
                className="text-transparent"
                style={{
                  backgroundImage: "linear-gradient(90deg, #F97316 0%, #FB923C 50%, #FDBA74 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t("hero.title2")}
              </span>
              <br />
              {t("hero.title3")}
            </h1>

            <p className="text-blue-200/80 text-lg leading-relaxed mb-8 max-w-lg">
              {t("hero.subtitle")}
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch}>
              <div
                className="rounded-2xl p-1.5"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 25px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
                }}
              >
                <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                  <div className="flex flex-col sm:flex-row gap-2.5 mb-2.5">
                    {/* Reg */}
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                        {t("hero.regLabel")}
                      </label>
                      <div className="relative">
                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10">
                          <div
                            className="text-[11px] font-black tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background: "#F7C300",
                              color: "#000",
                              border: "1.5px solid #333",
                              fontFamily: "Arial Black, sans-serif",
                              letterSpacing: "0.1em",
                            }}
                          >
                            UK
                          </div>
                        </div>
                        <input
                          type="text"
                          value={registration}
                          onChange={(e) => setRegistration(e.target.value.toUpperCase())}
                          placeholder="AB12 CDE"
                          className="w-full h-11 pl-14 pr-3 rounded-lg border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:border-[#1E3A5F] focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-sm font-bold tracking-[0.15em] uppercase text-slate-800 dark:text-white placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                          maxLength={8}
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                        {t("hero.locLabel")}
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder={t("hero.locPlaceholder")}
                          required
                          className="w-full h-11 pl-9 pr-3 rounded-lg border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:border-[#1E3A5F] focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                        />
                      </div>
                    </div>

                    {/* Service */}
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 px-1">
                        {t("hero.svcLabel")}
                      </label>
                      <div className="relative">
                        <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        <select
                          aria-label={t("hero.svcAria")}
                          value={serviceType}
                          onChange={(e) => setServiceType(e.target.value)}
                          className="w-full h-11 pl-9 pr-8 rounded-lg border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:border-[#1E3A5F] focus:outline-none text-sm text-slate-800 dark:text-white appearance-none cursor-pointer transition-all"
                        >
                          {services.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.icon ? `${s.icon} ` : ""}
                              {t(`svc.${s.value || "ALL"}` as MessageKey)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2.5 transition-all duration-200 cursor-pointer disabled:opacity-70"
                    style={{
                      background: loading
                        ? "#d97706"
                        : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                      boxShadow: "0 4px 20px rgba(249, 115, 22, 0.45)",
                    }}
                  >
                    <Search className="h-5 w-5" />
                    {loading ? t("hero.searching") : t("hero.submit")}
                  </button>
                </div>
              </div>
            </form>

            {/* Popular searches */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-white/40 text-xs font-medium">{t("hero.popular")}</span>
              {popularSearches.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => router.push(`/search?service=${s}`)}
                  className="text-xs text-white/70 hover:text-white bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 px-3 py-1 rounded-full transition-all duration-200 cursor-pointer"
                >
                  {t(`svc.${s}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT — Stats & Social Proof */}
          <div className="hidden lg:flex flex-col gap-4">
            {/* Trust pillars */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Shield, label: t("hero.pillar1.title"), sub: t("hero.pillar1.text"), color: "text-blue-400" },
                { icon: Star, label: t("hero.pillar2.title"), sub: t("hero.pillar2.text"), color: "text-yellow-400" },
                { icon: TrendingDown, label: t("hero.pillar3.title"), sub: t("hero.pillar3.text"), color: "text-green-400" },
                { icon: Zap, label: t("hero.pillar4.title"), sub: t("hero.pillar4.text"), color: "text-orange-400" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 p-3.5 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <item.icon className={`h-5 w-5 ${item.color} mt-0.5 flex-shrink-0`} />
                  <div>
                    <div className="text-white font-semibold text-sm">{item.label}</div>
                    <div className="text-white/45 text-xs">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 70" fill="none" preserveAspectRatio="none" style={{ display: "block" }}>
          <path d="M0 70L1440 70L1440 35C1200 65 960 10 720 35C480 60 240 5 0 35L0 70Z" fill="#F8FAFC" />
        </svg>
      </div>
    </section>
  )
}
