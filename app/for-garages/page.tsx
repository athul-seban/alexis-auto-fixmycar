import Link from "next/link"
import type { Metadata } from "next"
import {
  CheckCircle, ArrowRight, Zap, CalendarDays, Star,
  ClipboardList, MessageSquare, Wallet, ShieldCheck,
} from "lucide-react"
import { getLocale, getT } from "@/lib/i18n/server"
import { localePath } from "@/lib/i18n/config"
import type { MessageKey } from "@/lib/i18n/messages/en"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("forg.meta.title"), description: t("forg.meta.description") }
}

const BENEFITS: MessageKey[] = ["cta.benefit1", "cta.benefit2", "cta.benefit3", "cta.benefit4", "cta.benefit5"]

// Honest feature highlights (no invented revenue, sign-up or timing figures).
const CARDS = [
  { value: "cta.card1.value", label: "cta.card1.label", icon: Zap, color: "#8B5CF6" },
  { value: "cta.card2.value", label: "cta.card2.label", icon: CalendarDays, color: "#3B82F6" },
  { value: "cta.card3.value", label: "cta.card3.label", icon: MessageSquare, color: "#F97316" },
  { value: "cta.card4.value", label: "cta.card4.label", icon: Star, color: "#10B981" },
] as const satisfies readonly { value: MessageKey; label: MessageKey; icon: unknown; color: string }[]

const STEPS = [
  { icon: ClipboardList, title: "forg.step1.title", text: "forg.step1.text" },
  { icon: MessageSquare, title: "forg.step2.title", text: "forg.step2.text" },
  { icon: Wallet, title: "forg.step3.title", text: "forg.step3.text" },
] as const satisfies readonly { icon: unknown; title: MessageKey; text: MessageKey }[]

export default async function ForGaragesPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section
          className="py-24 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 40%, #1E3A5F 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-blue-500/8 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span
              className="inline-block text-xs font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full mb-6"
              style={{ background: "rgba(249, 115, 22, 0.15)", color: "#FB923C", border: "1px solid rgba(249, 115, 22, 0.25)" }}
            >
              {t("cta.badge")}
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-5 leading-[1.15] tracking-tight">
              {t("forg.hero.title1")}
              <br />
              <span
                style={{
                  backgroundImage: "linear-gradient(90deg, #F97316, #FDBA74)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t("forg.hero.title2")}
              </span>
            </h1>
            <p className="text-blue-200/80 text-lg mb-8 leading-relaxed max-w-2xl mx-auto">
              {t("cta.subtitle")}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/garage-register"
                className="inline-flex items-center gap-2.5 text-white font-bold px-6 py-3.5 rounded-xl text-base transition-all duration-200 hover:opacity-90 hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)" }}
              >
                {t("cta.register")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 font-semibold px-6 py-3.5 rounded-xl text-base transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
              >
                {t("forg.signin")}
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 bg-[#F8FAFC]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-5">
            {CARDS.map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${stat.color}1A`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                </div>
                <div className="text-2xl font-black text-slate-900 mb-1">{t(stat.value)}</div>
                <div className="text-sm text-slate-500">{t(stat.label)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works for garages */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="inline-block text-[#C2410C] dark:text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 border border-orange-100 px-4 py-1.5 rounded-full mb-4">
                {t("forg.process.badge")}
              </span>
              <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-4 tracking-tight">
                {t("forg.process.title")}
              </h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                {t("forg.process.subtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {STEPS.map((step, i) => (
                <div key={step.title} className="rounded-2xl p-7 border border-[#E8EDF5]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.04)" }}>
                  <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-5">
                    <step.icon className="h-7 w-7 text-[#F97316]" />
                  </div>
                  <div className="text-xs font-bold text-slate-500 mb-2">{t("forg.step", { n: i + 1 })}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{t(step.title)}</h3>
                  <p className="text-slate-500 leading-relaxed text-[15px]">{t(step.text)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-24 bg-[#F8FAFC]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                {t("forg.benefits.title")}
              </h2>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-10">
              <ul className="space-y-4">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-4 w-4 text-[#F97316]" />
                    </div>
                    <span className="text-slate-700 text-[15px]">{t(benefit)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-8 border-t border-gray-100 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#1E3A5F] flex-shrink-0" />
                <p className="text-sm text-slate-500">
                  {t("forg.benefits.note")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20" style={{ background: "linear-gradient(135deg, #0F1F3D 0%, #1E3A5F 100%)" }}>
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">{t("forg.final.title")}</h2>
            <p className="text-blue-200/80 mb-8">{t("forg.final.text")}</p>
            <Link
              href="/garage-register"
              className="inline-flex items-center gap-2.5 text-white font-bold px-7 py-4 rounded-xl text-base transition-all duration-200 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)" }}
            >
              {t("cta.register")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
