import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Sarah Mitchell",
    location: "London",
    vehicle: "2019 Ford Focus",
    service: "Full Service + MOT",
    rating: 5,
    saved: 85,
    review:
      "Absolutely fantastic! Saved £85 vs my dealer. The garage was professional and kept me updated throughout. The quote process took less than 30 minutes.",
    avatar: "SM",
    color: "#3B82F6",
    date: "2 weeks ago",
  },
  {
    name: "James Patel",
    location: "Birmingham",
    vehicle: "2021 Audi A3",
    service: "Cambelt Replacement",
    rating: 5,
    saved: 150,
    review:
      "Found a brilliant local garage and saved over £150 vs the dealership. Dead easy process and the garage did a perfect job. Highly recommend to anyone.",
    avatar: "JP",
    color: "#8B5CF6",
    date: "1 month ago",
  },
  {
    name: "Emma Thompson",
    location: "Manchester",
    vehicle: "2018 VW Golf",
    service: "Brake Replacement",
    rating: 5,
    saved: 65,
    review:
      "So easy! Got 3 quotes within an hour. The mechanic came to my home and sorted the brakes in no time. Saved £65 and didn't take a day off work.",
    avatar: "ET",
    color: "#10B981",
    date: "3 weeks ago",
  },
  {
    name: "David Chen",
    location: "Leeds",
    vehicle: "2020 BMW 3 Series",
    service: "Annual Service",
    rating: 5,
    saved: 120,
    review:
      "Was nervous finding a trusted garage for my BMW. FixMyCar's verified garages gave me confidence. Saved £120 and quality was just as good as the BMW dealer.",
    avatar: "DC",
    color: "#F97316",
    date: "1 month ago",
  },
  {
    name: "Sophie Williams",
    location: "Bristol",
    vehicle: "2017 Toyota Yaris",
    service: "Clutch Replacement",
    rating: 4,
    saved: 95,
    review:
      "Great platform for comparing prices! The quote process was transparent and the garage communicated brilliantly. Saved nearly £100 and the car drives perfectly.",
    avatar: "SW",
    color: "#F43F5E",
    date: "2 months ago",
  },
  {
    name: "Michael Brown",
    location: "Edinburgh",
    vehicle: "2022 Tesla Model 3",
    service: "EV Specialist Service",
    rating: 5,
    saved: 200,
    review:
      "Fantastic for finding EV specialists! Found an excellent certified garage at a fraction of the Tesla service centre price. Will always use FixMyCar first.",
    avatar: "MB",
    color: "#14B8A6",
    date: "3 weeks ago",
  },
]

export function Testimonials() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 border border-orange-100 px-4 py-1.5 rounded-full mb-4">
            Customer Reviews
          </span>
          <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-5 tracking-tight">
            What Our Customers Say
          </h2>
          {/* Aggregate rating */}
          <div
            className="inline-flex items-center gap-3 rounded-2xl px-6 py-3"
            style={{
              background: "linear-gradient(135deg, #FFFBEB, #FEF3C7)",
              border: "1px solid #FDE68A",
            }}
          >
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <div className="text-xl font-black text-slate-900">4.8</div>
            <div className="text-slate-500 text-sm">
              <span className="font-semibold text-slate-700">Excellent</span> · 50,000+ verified reviews
            </div>
          </div>
        </div>

        {/* Review grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, index) => (
            <div
              key={index}
              className="relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8EDF5",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Large quote mark */}
              <div
                className="absolute top-4 right-5 text-6xl font-black leading-none select-none opacity-[0.07]"
                style={{ color: t.color, fontFamily: "Georgia, serif" }}
                aria-hidden="true"
              >
                &ldquo;
              </div>

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i <= t.rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-100 text-gray-100"
                    }`}
                  />
                ))}
              </div>

              {/* Review text */}
              <p className="text-slate-600 text-[14px] leading-relaxed mb-5 line-clamp-4">
                {t.review}
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${t.color}cc, ${t.color})` }}
                >
                  {t.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {t.location} · {t.vehicle}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-black text-emerald-600">Saved £{t.saved}</div>
                  <div className="text-[11px] text-slate-400">{t.service}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trustpilot-style footer */}
        <div className="text-center mt-10 text-slate-400 text-sm">
          All reviews are verified purchases collected after service completion.
        </div>
      </div>
    </section>
  )
}
