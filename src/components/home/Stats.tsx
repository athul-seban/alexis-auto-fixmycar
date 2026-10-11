import { Building2, CheckCircle2, Star, MessageSquareText } from "lucide-react"
import { getHomeStats } from "@/lib/home-data"
import { getT } from "@/lib/i18n/server"

const MIN_STATS = 2

/** Live marketplace numbers. A figure that is zero is left out, and the section hides if fewer than two remain. */
export async function Stats() {
  const [h, t] = await Promise.all([getHomeStats(), getT()])
  const stats = [
    { icon: Building2, value: h.garages.toLocaleString("en-GB"), label: t("stats.garages"), sub: t("stats.garagesSub"), color: "#60A5FA", show: h.garages > 0 },
    { icon: CheckCircle2, value: h.completedJobs.toLocaleString("en-GB"), label: t("stats.jobs"), sub: t("stats.jobsSub"), color: "#34D399", show: h.completedJobs > 0 },
    { icon: MessageSquareText, value: h.reviews.toLocaleString("en-GB"), label: t("stats.reviews"), sub: t("stats.reviewsSub"), color: "#F97316", show: h.reviews > 0 },
    { icon: Star, value: h.averageRating !== null ? `${h.averageRating.toFixed(1)}/5` : "", label: t("stats.rating"), sub: t("stats.ratingSub", { n: h.reviews.toLocaleString("en-GB") }), color: "#FBBF24", show: h.averageRating !== null },
  ].filter((x) => x.show)
  if (stats.length < MIN_STATS) return null
  return (
    <section
      className="py-20 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 40%, #1a3055 100%)" }}
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

      {/* Glow accents */}
      <div className="absolute top-0 left-1/3 w-[400px] h-[200px] bg-blue-500/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[300px] h-[200px] bg-orange-500/8 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span
            className="text-xs font-bold uppercase tracking-[0.15em] mb-3 inline-block"
            style={{ color: "#F97316" }}
          >
            {t("stats.badge")}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">
            {t("stats.title")}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center rounded-2xl p-4 sm:p-6 group transition-all duration-300 hover:-translate-y-1"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ background: `${stat.color}15`, border: `1px solid ${stat.color}30` }}
              >
                <stat.icon className="h-6 w-6" style={{ color: stat.color }} />
              </div>
              <div
                className="text-3xl sm:text-4xl font-black mb-1 tabular-nums"
                style={{ color: "#FFFFFF" }}
              >
                {stat.value}
              </div>
              <div className="text-sm font-bold text-blue-100 mb-1">{stat.label}</div>
              <div className="text-xs text-blue-400">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
