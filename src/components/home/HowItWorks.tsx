import { ClipboardList, GitCompare, CalendarCheck, ArrowRight } from "lucide-react"
import { getT } from "@/lib/i18n/server"
import type { MessageKey } from "@/lib/i18n/messages/en"

const steps: { icon: typeof ClipboardList; number: string; titleKey: MessageKey; textKey: MessageKey; gradient: string; lightBg: string; glowColor: string; iconColor: string }[] = [
  {
    icon: ClipboardList,
    number: "01",
    titleKey: "howit.step1.title",
    textKey: "howit.step1.text",
    gradient: "from-blue-500 to-blue-600",
    lightBg: "#EFF6FF",
    glowColor: "rgba(59, 130, 246, 0.15)",
    iconColor: "#3B82F6",
  },
  {
    icon: GitCompare,
    number: "02",
    titleKey: "howit.step2.title",
    textKey: "howit.step2.text",
    gradient: "from-orange-500 to-orange-600",
    lightBg: "#FFF7ED",
    glowColor: "rgba(249, 115, 22, 0.15)",
    iconColor: "#F97316",
  },
  {
    icon: CalendarCheck,
    number: "03",
    titleKey: "howit.step3.title",
    textKey: "howit.step3.text",
    gradient: "from-emerald-500 to-emerald-600",
    lightBg: "#F0FDF4",
    glowColor: "rgba(16, 185, 129, 0.15)",
    iconColor: "#10B981",
  },
]

export async function HowItWorks() {
  const t = await getT()
  return (
    <section className="py-24 bg-[#F8FAFC] dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block text-[#C2410C] dark:text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 px-4 py-1.5 rounded-full mb-4">
            {t("howit.badge")}
          </span>
          <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
            {t("howit.title")}
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            {t("howit.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {steps.map((step, index) => (
            <div key={index} className="relative flex flex-col">
              {/* Arrow connector on desktop */}
              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute -right-4 top-12 z-10 items-center justify-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#E2E8F0] dark:bg-slate-700">
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              )}

              <div className="group flex-1 rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-slate-800 border border-[#E8EDF5] dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.04)]">
                {/* Step number badge */}
                <div className="flex items-start justify-between mb-5">
                  {/* Icon with glow */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                    style={{ background: step.lightBg, boxShadow: `0 0 0 8px ${step.glowColor}` }}
                  >
                    <step.icon className="h-7 w-7" style={{ color: step.iconColor }} />
                  </div>
                  <span
                    className="text-4xl font-black leading-none tabular-nums text-[#E8EDF5] dark:text-white/10 before:content-[attr(data-n)]"
                    data-n={step.number}
                    aria-hidden="true"
                  />
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t(step.titleKey)}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[15px]">{t(step.textKey)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom trust bar */}
        <div
          className="mt-10 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-center gap-6 text-center"
          style={{
            background: "linear-gradient(135deg, #0F1F3D 0%, #1E3A5F 100%)",
          }}
        >
          {[
            { value: t("howit.trust1.value"), label: t("howit.trust1.label") },
            { value: t("howit.trust2.value"), label: t("howit.trust2.label") },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              {i > 0 && <div className="hidden sm:block w-px h-8 bg-white/20" />}
              <div>
                <span className="text-[#F97316] font-extrabold text-lg">{item.value}</span>
                <span className="text-blue-200 text-sm ml-2">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
