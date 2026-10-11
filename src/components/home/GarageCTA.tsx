import Link from "next/link"
import { CheckCircle, ArrowRight, Zap, CalendarDays, MessageSquare, Star } from "lucide-react"
import { getLocale, getT } from "@/lib/i18n/server"
import { localePath } from "@/lib/i18n/config"
import type { MessageKey } from "@/lib/i18n/messages/en"

const BENEFITS: MessageKey[] = ["cta.benefit1", "cta.benefit2", "cta.benefit3", "cta.benefit4", "cta.benefit5"]

// Honest feature highlights (no invented revenue or sign-up figures).
const CARDS = [
  { value: "cta.card1.value", label: "cta.card1.label", icon: Zap, color: "#8B5CF6" },
  { value: "cta.card2.value", label: "cta.card2.label", icon: CalendarDays, color: "#3B82F6" },
  { value: "cta.card3.value", label: "cta.card3.label", icon: MessageSquare, color: "#F97316" },
  { value: "cta.card4.value", label: "cta.card4.label", icon: Star, color: "#10B981" },
] as const satisfies readonly { value: MessageKey; label: MessageKey; icon: unknown; color: string }[]

export async function GarageCTA() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 40%, #1E3A5F 100%)" }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-blue-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

          {/* LEFT — Copy */}
          <div>
            <span
              className="inline-block text-xs font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full mb-6"
              style={{
                background: "rgba(249, 115, 22, 0.15)",
                color: "#FB923C",
                border: "1px solid rgba(249, 115, 22, 0.25)",
              }}
            >
              {t("cta.badge")}
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-extrabold text-white mb-5 leading-[1.15] tracking-tight">
              {t("cta.title1")}
              <br />
              <span
                style={{
                  backgroundImage: "linear-gradient(90deg, #F97316, #FDBA74)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t("cta.title2")}
              </span>
            </h2>
            <p className="text-blue-200/80 text-lg mb-8 leading-relaxed max-w-lg">
              {t("cta.subtitle")}
            </p>

            <ul className="space-y-3.5 mb-9">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#F97316]/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="h-3.5 w-3.5 text-[#F97316]" />
                  </div>
                  <span className="text-blue-100 text-[15px]">{t(benefit)}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/garage-register"
                className="inline-flex items-center gap-2.5 text-white font-bold px-6 py-3.5 rounded-xl text-base transition-all duration-200 hover:opacity-90 hover:shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                  boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)",
                }}
              >
                {t("cta.register")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href={localePath(locale, "/for-garages")}
                className="inline-flex items-center gap-2 font-semibold px-6 py-3.5 rounded-xl text-base transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {t("cta.learnMore")}
              </Link>
            </div>
          </div>

          {/* RIGHT — Stat cards */}
          <div className="grid grid-cols-2 gap-4">
            {CARDS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${stat.color}20`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                </div>
                <div className="text-3xl font-black text-white mb-1">{t(stat.value)}</div>
                <div className="text-sm text-blue-300">{t(stat.label)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom social proof strip */}
        <div
          className="mt-14 rounded-2xl p-5 text-center"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-blue-200/70 text-sm">
            {t("cta.strip")}
          </p>
        </div>
      </div>
    </section>
  )
}
