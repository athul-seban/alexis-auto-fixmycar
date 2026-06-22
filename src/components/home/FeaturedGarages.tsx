import Link from "next/link"
import { MapPin, Star, Shield, Clock, ChevronRight, Car, Award } from "lucide-react"

const garages = [
  {
    id: "1",
    name: "Premier Auto Services",
    slug: "premier-auto-services",
    city: "London",
    postcode: "SW1A 1AA",
    rating: 4.9,
    reviews: 342,
    isVerified: true,
    isMobile: false,
    services: ["MOT", "Full Service", "Brakes"],
    priceRange: "££",
    responseTime: "< 1 hour",
    description: "Family-run garage with 20+ years of experience. Specialists in all makes and models.",
    initials: "PA",
    accentColor: "#3B82F6",
  },
  {
    id: "2",
    name: "QuickFix Mobile Mechanics",
    slug: "quickfix-mobile",
    city: "Manchester",
    postcode: "M1 1AA",
    rating: 4.8,
    reviews: 218,
    isVerified: true,
    isMobile: true,
    services: ["Diagnostics", "Battery", "Tyres"],
    priceRange: "£",
    responseTime: "Same day",
    description: "Mobile mechanics who come to you. Available 7 days a week across Manchester.",
    initials: "QF",
    accentColor: "#10B981",
  },
  {
    id: "3",
    name: "Elite Car Care Centre",
    slug: "elite-car-care",
    city: "Birmingham",
    postcode: "B1 1AA",
    rating: 4.7,
    reviews: 185,
    isVerified: true,
    isMobile: false,
    services: ["MOT", "Cambelt", "Clutch"],
    priceRange: "£££",
    responseTime: "< 2 hours",
    description: "Award-winning garage specialising in premium and performance vehicles.",
    initials: "EC",
    accentColor: "#8B5CF6",
  },
  {
    id: "4",
    name: "Citygate Garage",
    slug: "citygate-garage",
    city: "Leeds",
    postcode: "LS1 1AA",
    rating: 4.6,
    reviews: 156,
    isVerified: false,
    isMobile: false,
    services: ["Full Service", "Exhaust", "Air Con"],
    priceRange: "££",
    responseTime: "< 3 hours",
    description: "Trusted local garage serving Leeds for over 15 years. Free collection available.",
    initials: "CG",
    accentColor: "#F97316",
  },
]

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"
          }`}
        />
      ))}
    </div>
  )
}

export function FeaturedGarages() {
  return (
    <section className="py-24 bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <span className="inline-block text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 border border-orange-100 px-4 py-1.5 rounded-full mb-4">
              Top Rated
            </span>
            <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 tracking-tight">
              Featured Garages
            </h2>
            <p className="text-slate-500 mt-2">
              Hand-picked, vetted garages with outstanding customer reviews.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-[#1E3A5F] font-semibold text-sm border border-slate-200 bg-white hover:border-[#1E3A5F] px-4 py-2.5 rounded-xl transition-all hover:shadow-sm flex-shrink-0"
          >
            View All Garages
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {garages.map((garage) => (
            <Link
              key={garage.id}
              href={`/garage/${garage.slug}`}
              className="group block rounded-2xl p-5 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
              style={{
                border: "1px solid #E8EDF5",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div className="flex gap-4">
                {/* Avatar */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                  style={{ background: `linear-gradient(135deg, ${garage.accentColor}dd, ${garage.accentColor})` }}
                >
                  {garage.initials}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-900 text-[15px] leading-tight group-hover:text-[#1E3A5F] transition-colors truncate">
                      {garage.name}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {garage.isVerified && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                          <Shield className="h-2.5 w-2.5" />
                          Verified
                        </span>
                      )}
                      {garage.isMobile && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
                          <Car className="h-2.5 w-2.5" />
                          Mobile
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-2">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span>{garage.city}, {garage.postcode}</span>
                    <span className="mx-1">·</span>
                    <span className="text-slate-500 font-medium">{garage.priceRange}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">
                    {garage.description}
                  </p>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <StarRow rating={garage.rating} />
                      <span className="text-xs font-bold text-slate-800">{garage.rating}</span>
                      <span className="text-xs text-slate-400">({garage.reviews})</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {garage.responseTime}
                    </div>
                  </div>

                  {/* Service tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-50">
                    {garage.services.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-100 px-2 py-0.5 rounded-md"
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
          <p className="text-slate-500 text-sm mb-4">
            Over <strong className="text-slate-800">15,000 verified garages</strong> across the UK — find the right one near you.
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
            Find Top-Rated Garages Near Me
          </Link>
        </div>
      </div>
    </section>
  )
}
