import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Search, MessageSquare, Wallet } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { HowItWorks } from "@/components/home/HowItWorks"
import { getLocale, getT } from "@/lib/i18n/server"
import { localePath } from "@/lib/i18n/config"
import type { MessageKey } from "@/lib/i18n/messages/en"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("how.meta.title"), description: t("how.meta.description") }
}

const GARAGE_STEPS = [
  { icon: Search, title: "how.garages.step1.title", text: "how.garages.step1.text" },
  { icon: MessageSquare, title: "how.garages.step2.title", text: "how.garages.step2.text" },
  { icon: Wallet, title: "how.garages.step3.title", text: "how.garages.step3.text" },
] as const satisfies readonly { icon: unknown; title: MessageKey; text: MessageKey }[]

export default async function HowItWorksPage() {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  return (
    <>
      <Header />
      <main>
        <section className="py-20 bg-[#1E3A5F] text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
              {t("how.hero.title")}
            </h1>
            <p className="text-blue-200/80 text-lg">
              {t("how.hero.text")}
            </p>
          </div>
        </section>

        <HowItWorks />

        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="inline-block text-[#1E3A5F] font-bold text-xs uppercase tracking-[0.15em] bg-blue-50 border border-blue-100 px-4 py-1.5 rounded-full mb-4">
                {t("how.garages.badge")}
              </span>
              <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-4 tracking-tight">
                {t("how.garages.title")}
              </h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                {t("how.garages.subtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {GARAGE_STEPS.map((step, i) => (
                <div key={step.title} className="rounded-2xl p-7 border border-[#E8EDF5]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.04)" }}>
                  <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
                    <step.icon className="h-7 w-7 text-[#1E3A5F]" />
                  </div>
                  <div className="text-xs font-bold text-slate-500 mb-2">{t("forg.step", { n: i + 1 })}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{t(step.title)}</h3>
                  <p className="text-slate-500 leading-relaxed text-[15px]">{t(step.text)}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link
                href={localePath(locale, "/for-garages")}
                className="inline-flex items-center gap-2 text-[#C2410C] dark:text-[#F97316] font-bold hover:underline"
              >
                {t("how.garages.more")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
