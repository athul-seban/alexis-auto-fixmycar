import Link from "next/link"
import { Star } from "lucide-react"
import { getHomeReviews, getHomeStats } from "@/lib/home-data"

const COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F97316", "#F43F5E", "#14B8A6"]
const MIN_REVIEWS = 3

const dateLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

/** Real, recent 4★+ customer reviews. Hidden until there are enough genuine ones to be representative. */
export async function Testimonials() {
  const [reviews, stats] = await Promise.all([getHomeReviews(6), getHomeStats()])
  if (reviews.length < MIN_REVIEWS) return null

  return (
    <section className="py-24 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-block text-[#C2410C] dark:text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20 px-4 py-1.5 rounded-full mb-4">
            Customer Reviews
          </span>
          <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 dark:text-white mb-5 tracking-tight">What Our Customers Say</h2>
          {stats.averageRating !== null && (
            <div className="inline-flex items-center gap-3 rounded-2xl px-6 py-3 bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7] border border-[#FDE68A] dark:from-amber-500/10 dark:to-amber-500/5 dark:border-amber-500/30">
              <div className="flex gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">{stats.averageRating.toFixed(1)}</div>
              <div className="text-slate-500 dark:text-slate-400 text-sm">
                from {stats.reviews.toLocaleString("en-GB")} review{stats.reviews === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>

        <div
          role="region"
          aria-label="Customer reviews"
          tabIndex={0}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-5 md:mx-0 md:px-0 md:pt-0 md:pb-0 md:overflow-visible"
        >
          {reviews.map((r, index) => {
            const color = COLORS[index % COLORS.length]
            return (
              <figure
                key={r.id}
                className="relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg bg-white dark:bg-slate-800 border border-[#E8EDF5] dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex-none w-[85%] snap-center md:w-auto"
              >
                <div className="absolute top-4 right-5 text-6xl font-black leading-none select-none opacity-[0.07]" style={{ color, fontFamily: "Georgia, serif" }} aria-hidden="true">
                  &ldquo;
                </div>
                <div className="flex gap-0.5 mb-4" role="img" aria-label={`${r.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={`h-4 w-4 ${i <= r.rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-100 text-gray-100 dark:fill-slate-700 dark:text-slate-700"}`} />
                  ))}
                </div>
                <blockquote className="text-slate-600 dark:text-slate-300 text-[14px] leading-relaxed mb-5 line-clamp-4">{r.comment}</blockquote>
                <figcaption className="flex items-center gap-3 pt-4 border-t border-slate-50 dark:border-white/10">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${color}cc, ${color})` }} aria-hidden>
                    {r.author[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{r.author}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {r.service} at{" "}
                      <Link href={`/garage/${r.garageSlug}`} className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200">
                        {r.garageName}
                      </Link>{" "}
                      · {dateLabel(r.createdAt)}
                    </p>
                  </div>
                </figcaption>
              </figure>
            )
          })}
        </div>

        <div className="text-center mt-10 text-slate-500 dark:text-slate-400 text-sm">Reviews are left by customers after a completed booking.</div>
      </div>
    </section>
  )
}
