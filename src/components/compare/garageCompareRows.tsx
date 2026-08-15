import Link from "next/link"
import { Star, Shield, Car, MapPin, Clock, CheckCircle, Minus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getServiceLabel, getTodayOpeningHoursLabel } from "@/lib/utils"
import type { CompareRowConfig } from "@/components/compare/CompareTable"
import type { GarageProfile, ServiceType } from "@/types"

export function buildGarageCompareRows(garages: GarageProfile[]): CompareRowConfig<GarageProfile>[] {
  const allServices = Array.from(new Set(garages.flatMap((g) => g.services))) as ServiceType[]

  const rows: CompareRowConfig<GarageProfile>[] = [
    {
      type: "data",
      key: "rating",
      label: "Rating",
      icon: Star,
      render: (g) => (
        <span>
          <span className="font-bold text-slate-900">{g.averageRating > 0 ? g.averageRating.toFixed(1) : "New"}</span>
          {g.totalReviews > 0 && <span className="text-slate-400"> ({g.totalReviews} reviews)</span>}
        </span>
      ),
    },
    {
      type: "data",
      key: "verified",
      label: "Verified",
      icon: Shield,
      render: (g) =>
        g.isVerified ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Minus className="h-4 w-4 text-slate-300" />,
    },
    {
      type: "data",
      key: "mobile",
      label: "Mobile Mechanic",
      icon: Car,
      render: (g) =>
        g.isMobile ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Minus className="h-4 w-4 text-slate-300" />,
    },
    { type: "section", key: "services-header", label: "Services Offered" },
    ...allServices.map((service): CompareRowConfig<GarageProfile> => ({
      type: "data",
      key: `service-${service}`,
      label: getServiceLabel(service),
      render: (g) =>
        g.services.includes(service) ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Minus className="h-4 w-4 text-slate-300" />
        ),
    })),
    {
      type: "data",
      key: "address",
      label: "Location",
      icon: MapPin,
      render: (g) => (
        <span>
          {g.address}, {g.city} {g.postcode}
        </span>
      ),
    },
    {
      type: "data",
      key: "hours",
      label: "Open Today",
      icon: Clock,
      render: (g) => getTodayOpeningHoursLabel(g.openingHours),
    },
    {
      type: "data",
      key: "cta",
      label: "",
      render: (g) => (
        <Link href={`/garage/${g.slug}`}>
          <Button size="sm" className="w-full">Get Quote</Button>
        </Link>
      ),
    },
  ]

  return rows
}

export function GarageCompareColumnHeader({
  garage,
  onRemove,
}: {
  garage: GarageProfile
  onRemove: () => void
}) {
  const initials = garage.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-start gap-3">
      {garage.logo ? (
        <img src={garage.logo} alt={garage.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-[#1E3A5F] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Link href={`/garage/${garage.slug}`} className="font-bold text-slate-900 text-sm hover:text-[#1E3A5F] transition-colors block truncate">
          {garage.name}
        </Link>
        <p className="text-xs text-slate-500 truncate">{garage.city}</p>
      </div>
      <button
        onClick={onRemove}
        className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer flex-shrink-0"
        aria-label={`Remove ${garage.name} from comparison`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
