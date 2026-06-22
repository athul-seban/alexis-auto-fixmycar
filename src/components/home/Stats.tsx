import { Building2, Users, PoundSterling, Star, TrendingUp } from "lucide-react"

const stats = [
  {
    icon: Building2,
    value: "15,000+",
    label: "Verified Garages",
    sub: "Nationwide network",
    color: "#60A5FA",
  },
  {
    icon: Users,
    value: "500K+",
    label: "Happy Customers",
    sub: "And growing every day",
    color: "#34D399",
  },
  {
    icon: PoundSterling,
    value: "£110",
    label: "Average Saving",
    sub: "Per booking vs dealership",
    color: "#F97316",
  },
  {
    icon: Star,
    value: "4.8/5",
    label: "Customer Rating",
    sub: "Based on 50,000+ reviews",
    color: "#FBBF24",
  },
]

export function Stats() {
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
            By the Numbers
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">
            The UK&apos;s Largest Car Repair Marketplace
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center rounded-2xl p-6 group transition-all duration-300 hover:-translate-y-1"
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
                className="text-4xl font-black mb-1 tabular-nums"
                style={{ color: "#FFFFFF" }}
              >
                {stat.value}
              </div>
              <div className="text-sm font-bold text-blue-100 mb-1">{stat.label}</div>
              <div className="text-xs text-blue-400">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Trending indicator */}
        <div className="flex items-center justify-center gap-2 mt-8 text-emerald-400">
          <TrendingUp className="h-4 w-4" />
          <span className="text-sm font-medium text-emerald-400/80">
            500 new garages joined this month
          </span>
        </div>
      </div>
    </section>
  )
}
