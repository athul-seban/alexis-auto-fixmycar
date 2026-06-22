import Link from "next/link"
import {
  Gauge,
  Settings,
  Wrench,
  Activity,
  Circle,
  Battery,
  Wind,
  Eye,
  Zap,
  TriangleAlert,
  RefreshCw,
  Car,
} from "lucide-react"

const categories = [
  {
    icon: Gauge,
    label: "MOT Test",
    href: "/search?service=MOT",
    bg: "#FEF2F2",
    color: "#EF4444",
    popular: true,
  },
  {
    icon: Settings,
    label: "Full Service",
    href: "/search?service=FULL_SERVICE",
    bg: "#EFF6FF",
    color: "#3B82F6",
    popular: true,
  },
  {
    icon: Settings,
    label: "Interim Service",
    href: "/search?service=INTERIM_SERVICE",
    bg: "#EEF2FF",
    color: "#6366F1",
    popular: false,
  },
  {
    icon: TriangleAlert,
    label: "Brakes",
    href: "/search?service=BRAKES",
    bg: "#FFF7ED",
    color: "#F97316",
    popular: true,
  },
  {
    icon: Circle,
    label: "Tyres",
    href: "/search?service=TYRES",
    bg: "#F8FAFC",
    color: "#64748B",
    popular: true,
  },
  {
    icon: Wrench,
    label: "Engine Repair",
    href: "/search?service=REPAIR",
    bg: "#F9FAFB",
    color: "#6B7280",
    popular: false,
  },
  {
    icon: Activity,
    label: "Diagnostics",
    href: "/search?service=DIAGNOSTICS",
    bg: "#FAF5FF",
    color: "#8B5CF6",
    popular: false,
  },
  {
    icon: RefreshCw,
    label: "Clutch",
    href: "/search?service=CLUTCH",
    bg: "#FEFCE8",
    color: "#EAB308",
    popular: false,
  },
  {
    icon: RefreshCw,
    label: "Cambelt",
    href: "/search?service=CAMBELT",
    bg: "#FFFBEB",
    color: "#F59E0B",
    popular: false,
  },
  {
    icon: Wind,
    label: "Exhaust",
    href: "/search?service=EXHAUST",
    bg: "#F0FDFA",
    color: "#14B8A6",
    popular: false,
  },
  {
    icon: Battery,
    label: "Battery",
    href: "/search?service=BATTERY",
    bg: "#F0FDF4",
    color: "#22C55E",
    popular: false,
  },
  {
    icon: Eye,
    label: "Windscreen",
    href: "/search?service=WINDSCREEN",
    bg: "#F0F9FF",
    color: "#0EA5E9",
    popular: false,
  },
  {
    icon: Wind,
    label: "Air Con",
    href: "/search?service=AIR_CON",
    bg: "#ECFEFF",
    color: "#06B6D4",
    popular: false,
  },
  {
    icon: Zap,
    label: "Electric Vehicle",
    href: "/search?service=ELECTRIC_SERVICE",
    bg: "#ECFDF5",
    color: "#10B981",
    popular: false,
  },
  {
    icon: Car,
    label: "Mobile Mechanic",
    href: "/search?mobile=true",
    bg: "#F5F3FF",
    color: "#7C3AED",
    popular: true,
  },
  {
    icon: Wrench,
    label: "All Repairs",
    href: "/search",
    bg: "#FFF1F2",
    color: "#F43F5E",
    popular: false,
  },
]

export function ServiceCategories() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 border border-orange-100 px-4 py-1.5 rounded-full mb-4">
            What Do You Need?
          </span>
          <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-4 tracking-tight">
            Browse by Service
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Find local specialists for every type of car repair and maintenance.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {categories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-transparent hover:border-current transition-all duration-200 cursor-pointer group"
              style={{
                background: "#FAFBFC",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {cat.popular && (
                <span
                  className="absolute -top-2 -right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#F97316" }}
                >
                  Hot
                </span>
              )}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110"
                style={{ background: cat.bg }}
              >
                <cat.icon className="h-5 w-5" style={{ color: cat.color }} />
              </div>
              <span className="text-[12px] font-semibold text-slate-700 text-center leading-tight group-hover:text-slate-900">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 text-[#1E3A5F] font-semibold text-sm hover:text-[#F97316] transition-colors"
          >
            Browse all services →
          </Link>
        </div>
      </div>
    </section>
  )
}
