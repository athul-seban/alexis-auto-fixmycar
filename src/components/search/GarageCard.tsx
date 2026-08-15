"use client"

import Link from "next/link"
import { MapPin, Star, Shield, Clock, ChevronRight, Car, GitCompareArrows, CheckSquare } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getServiceLabel } from "@/lib/utils"
import { useCompare } from "@/context/CompareContext"
import type { GarageListItem } from "@/types"

interface GarageCardProps {
  garage: GarageListItem
  distance?: number
}

export function GarageCard({ garage, distance }: GarageCardProps) {
  const { isSelected, toggleGarage, maxReached } = useCompare()
  const selected = isSelected(garage.id)

  const initials = garage.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-lg hover:border-[#F97316]/30 transition-all duration-200 overflow-hidden">
      <div className="p-5">
        <div className="flex gap-4">
          {/* Avatar / Logo */}
          {garage.logo ? (
            <img
              src={garage.logo}
              alt={garage.name}
              className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[#1E3A5F] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/garage/${garage.slug}`}
                  className="font-bold text-slate-900 text-lg leading-tight hover:text-[#1E3A5F] transition-colors block truncate"
                >
                  {garage.name}
                </Link>
                <div className="flex items-center gap-1 mt-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {garage.city}, {garage.postcode}
                    {distance !== undefined && (
                      <span className="text-slate-400 ml-1">· {distance.toFixed(1)} miles</span>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {garage.isVerified && (
                  <Badge variant="verified" className="gap-1 text-xs">
                    <Shield className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
                {garage.isMobile && (
                  <Badge variant="accent" className="gap-1 text-xs">
                    <Car className="h-3 w-3" />
                    Mobile
                  </Badge>
                )}
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i <= Math.round(garage.averageRating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-gray-200 text-gray-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-slate-800">
                {garage.averageRating > 0 ? garage.averageRating.toFixed(1) : "New"}
              </span>
              {garage.totalReviews > 0 && (
                <span className="text-sm text-slate-500">({garage.totalReviews} reviews)</span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {garage.description && (
          <p className="text-sm text-slate-500 mt-3 line-clamp-2">{garage.description}</p>
        )}

        {/* Services */}
        {garage.services.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {garage.services.slice(0, 5).map((s) => (
              <span
                key={s}
                className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md"
              >
                {getServiceLabel(s)}
              </span>
            ))}
            {garage.services.length > 5 && (
              <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                +{garage.services.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-5 py-3 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          <span>Usually responds within 1 hour</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant={selected ? "primary" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!selected && maxReached}
            title={!selected && maxReached ? "You can compare up to 4 garages at once" : undefined}
            onClick={() =>
              toggleGarage({ id: garage.id, name: garage.name, slug: garage.slug, logo: garage.logo, city: garage.city })
            }
          >
            {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{selected ? "Added" : "Compare"}</span>
          </Button>
          <Link href={`/garage/${garage.slug}`}>
            <Button size="sm" className="gap-1.5 text-xs">
              Get Quote
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
