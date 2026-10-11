import Link from "next/link"
import { getFeaturedGarages, type FeaturedGarage } from "@/lib/home-data"
import { getT } from "@/lib/i18n/server"
import { MapPin, Star, Shield, Clock, ChevronRight, Car, Award } from "lucide-react"

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200 dark:text-slate-700 dark:fill-slate-700"
          }`}
        />
      ))}
    </div>
  )
}

const ACCENTS = ["#3B82F6", "#10B981", "#8B5CF6", "#F97316", "#14B8A6", "#F43F5E"]
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
const accentFor = (g: FeaturedGarage) => ACCENTS[[...g.slug].reduce((n, c) => n + c.charCodeAt(0), 0) % ACCENTS.length]

export async function FeaturedGarages() {
  const [garages, t] = await Promise.all([getFeaturedGarages(4), getT()])
  // Nothing real to show yet: leave the section out rather than fill it with placeholders.
  if (garages.length === 0) return null
  return (
    <section className="py-24 bg-[#F8FAFC] dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <span className="inline-block text-[#C2410C] dark:text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 px-4 py-1.5 rounded-full mb-4">
              {t("feat.badge")}
            </span>
            <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 dark:text-white tracking-tight">
              {t("feat.title")}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {t("feat.subtitle")}
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-[#1E3A5F] dark:text-white font-semibold text-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 hover:border-[#1E3A5F] dark:hover:border-white/30 px-4 py-2.5 rounded-xl transition-all hover:shadow-sm flex-shrink-0"
          >
            {t("feat.viewAll")}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {garages.map((garage) => (
            <Link
              key={garage.id}
              href={`/garage/${garage.slug}`}
              className="group block rounded-2xl p-5 bg-white dark:bg-slate-800 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer border border-[#E8EDF5] dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex gap-4">
                {/* Avatar */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                  style={{ background: `linear-gradient(135deg, ${accentFor(garage)}dd, ${accentFor(garage)})` }}
                >
                  {initials(garage.name)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex flex-col gap-1.5 mb-1 lg:flex-row lg:items-start lg:justify-between lg:gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-[15px] leading-tight group-hover:text-[#1E3A5F] dark:group-hover:text-orange-400 transition-colors lg:truncate">
                      {garage.name}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {garage.featured && (
                        <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-500/30">
                          {t("feat.featured")}
                        </span>
                      )}
                      {garage.isVerified && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-500/30">
                          <Shield className="h-2.5 w-2.5" />
                          {t("feat.verified")}
                        </span>
                      )}
                      {garage.isMobile && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-500/30">
                          <Car className="h-2.5 w-2.5" />
                          {t("feat.mobile")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span>{garage.city}, {garage.postcode}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2">
                    {garage.description ?? `${garage.name} in ${garage.city}.`}
                  </p>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between">
                    {garage.reviews > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <StarRow rating={garage.rating} />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{garage.rating}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">({garage.reviews})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("feat.new")}</span>
                    )}
                    {garage.responseTime && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3" />
                        {garage.responseTime}
                      </div>
                    )}
                  </div>

                  {/* Service tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-50 dark:border-white/10" hidden={garage.services.length === 0}>
                    {garage.services.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-semibold bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-600 px-2 py-0.5 rounded-md"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-8">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {t("feat.cta")}
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2.5 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all duration-200 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #1E3A5F 0%, #2D5A8E 100%)",
              boxShadow: "0 4px 15px rgba(30, 58, 95, 0.3)",
            }}
          >
            <Award className="h-4 w-4" />
            {t("feat.button")}
          </Link>
        </div>
      </div>
    </section>
  )
}
