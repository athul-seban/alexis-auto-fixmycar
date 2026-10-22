"use client"

import { useState } from "react"
import Link from "next/link"
import { RemoteImage } from "@/components/ui/remote-image"
import { useSession } from "next-auth/react"
import {
  MapPin, Star, Shield, Phone, Mail, Globe, Car,
  ChevronLeft, MessageSquare, CheckCircle, AlertCircle, CalendarCheck, Navigation,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getServiceLabel } from "@/lib/utils"
import type { PublicGarage } from "@/lib/public-garage"
import { OpenNowBadge } from "@/components/garage/OpenNowBadge"
import { directionsUrl } from "@/lib/geo-links"
import { formatLondonDate } from "@/lib/portal/tz"
import { priceLabel } from "@/lib/portal/service-defaults"
import { QuoteRequestDialog } from "@/components/garage/QuoteRequestDialog"

const VERIFICATION_BADGE_LABELS: Record<string, string> = {
  ID_VERIFIED: "ID Verified",
  INSURANCE_VERIFIED: "Insurance Verified",
  QUALIFICATIONS_VERIFIED: "Qualifications Verified",
}

interface Props {
  garage: PublicGarage | null
  /** Carried from the search that led here, so the quote dialog opens already filled in. */
  initialService?: string
  initialReg?: string
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

export function GarageProfilePage({ garage, initialService, initialReg }: Props) {
  const { data: session } = useSession()
  const user = session?.user as { role?: string } | undefined

  const [activeTab, setActiveTab] = useState<"services" | "reviews" | "info">("services")
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  if (!garage) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Garage not found</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">This garage may no longer be listed.</p>
        <Link href="/search"><Button variant="outline">Back to search</Button></Link>
      </div>
    )
  }

  const ratingBreakdown = garage.ratingBreakdown
  const bookHref = `/widget/${garage.slug}?from=profile${initialService ? `&service=${initialService}` : ""}${initialReg ? `&vrm=${encodeURIComponent(initialReg)}` : ""}`

  return (
    <div>
      {/* Hero */}
      <div className="bg-[#1E3A5F] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/search" className="inline-flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-4 transition-colors">
            <ChevronLeft className="h-4 w-4" />
            Back to search results
          </Link>
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-20 h-20 rounded-xl bg-white flex items-center justify-center text-[#1E3A5F] font-bold text-2xl flex-shrink-0 overflow-hidden">
              {garage.logo ? (
                <RemoteImage src={garage.logo} alt={garage.name} width={160} height={160} sizes="80px" className="w-full h-full object-cover" priority />
              ) : (
                garage.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-white">{garage.name}</h1>
                {garage.isVerified && (
                  <Badge variant="verified" className="gap-1">
                    <Shield className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
                {garage.isMobile && (
                  <Badge variant="accent" className="gap-1">
                    <Car className="h-3 w-3" />
                    Mobile
                  </Badge>
                )}
                {garage.verificationBadges?.map((badge) => (
                  <Badge key={badge} variant="secondary" className="gap-1">
                    <Shield className="h-3 w-3" />
                    {VERIFICATION_BADGE_LABELS[badge] ?? badge}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-blue-200 text-sm">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {garage.address}, {garage.city} {garage.postcode}
                </div>
                <OpenNowBadge hours={garage.openingHours} />
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`h-4 w-4 ${i <= Math.round(garage.averageRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-500"}`} />
                    ))}
                  </div>
                  <span className="font-bold text-white">{garage.averageRating.toFixed(1)}</span>
                  <span>({garage.totalReviews} reviews)</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={`tel:${garage.phone}`}>
                <Button variant="white" size="lg" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
              </a>
              {garage.bookOnline && (
                <Link href={bookHref}>
                  <Button size="lg" className="gap-2">
                    <CalendarCheck className="h-4 w-4" />
                    Book online
                  </Button>
                </Link>
              )}
              <Button size="lg" variant={garage.bookOnline ? "white" : "primary"} className="gap-2" onClick={() => setShowQuoteForm(true)}>
                <MessageSquare className="h-4 w-4" />
                Get Quote
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {garage.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                {garage.images.slice(0, 6).map((img, i) => (
                  <RemoteImage key={i} src={img} alt={`${garage.name} photo ${i + 1}`} width={480} height={224} sizes="(min-width: 1024px) 22vw, 30vw" className="w-full h-28 object-cover rounded-lg" />
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white dark:bg-slate-800 rounded-xl p-1 border border-gray-200 dark:border-white/10">
              {(["services", "reviews", "info"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "bg-[#1E3A5F] text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  {tab === "reviews" ? `Reviews (${garage.totalReviews})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div hidden={activeTab !== "services"}>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">About</h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-6">{garage.description || "No description provided yet."}</p>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Services Offered</h2>
                {garage.services.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No services listed yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {garage.services.map((s) => {
                      const price = garage.prices?.find((p) => p.serviceType === s)
                      const label = price ? priceLabel(price.priceFrom, price.priceTo) : null
                      return (
                        <div key={s} className="flex items-center gap-2.5 p-3 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-100 dark:border-white/10" title={price?.notes ?? undefined}>
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{getServiceLabel(s)}</span>
                            {label && <span className="block text-xs font-semibold text-[#1E3A5F] dark:text-blue-300">{label}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div hidden={activeTab !== "reviews"}>
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-6">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-slate-900 dark:text-white">{garage.averageRating.toFixed(1)}</div>
                      <div className="flex justify-center mt-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{garage.totalReviews} reviews</div>
                    </div>
                    <div className="flex-1">
                      {ratingBreakdown.map(({ stars, pct }) => (
                        <div key={stars} className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400 w-3">{stars}</span>
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 w-6">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {garage.reviews.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10">
                    <Star className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No reviews yet.</p>
                  </div>
                ) : (
                  garage.reviews.map((review) => (
                    <div key={review.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {review.author.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">{review.author}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star key={i} className={`h-4 w-4 ${i <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 dark:text-slate-700"}`} />
                            ))}
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{formatLondonDate(review.createdAt)}</span>
                        </div>
                      </div>
                      {review.title && <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{review.title}</p>}
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{review.comment}</p>
                      {review.reply && (
                        <div className="mt-3 rounded-lg border-l-4 border-[#F97316] bg-slate-50 p-3 dark:bg-white/5">
                          <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Response from {garage.name}
                            {review.repliedAt && ` · ${formatLondonDate(review.repliedAt)}`}
                          </p>
                          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{review.reply}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div hidden={activeTab !== "info"}>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Opening Hours</h2>
                <div className="space-y-2">
                  {DAYS.map((day) => {
                    const hours = garage.openingHours?.[day]
                    return (
                      <div key={day} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-white/5 last:border-0">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize w-28">{day}</span>
                        {hours?.open ? (
                          <span className="text-sm text-slate-600 dark:text-slate-300">{hours.from} – {hours.to}</span>
                        ) : (
                          <span className="text-sm text-red-500 dark:text-red-400 font-medium">Closed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {garage.bookOnline && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                <h3 className="font-bold text-slate-900 dark:text-white mb-3">Book online</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Pick a day and time that suits you. No account needed.</p>
                <Link href={bookHref}>
                  <Button className="w-full gap-2" size="lg">
                    <CalendarCheck className="h-4 w-4" />
                    Choose a time
                  </Button>
                </Link>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-3">Request a Free Quote</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Get a no-obligation quote from this garage.</p>
              <Button className="w-full gap-2" size="lg" onClick={() => setShowQuoteForm(true)}>
                <MessageSquare className="h-4 w-4" />
                Get Free Quote
              </Button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Contact Info</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <a href={`tel:${garage.phone}`} className="text-slate-700 dark:text-slate-200 hover:text-[#1E3A5F] dark:hover:text-white transition-colors">
                    {garage.phone}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <a href={`mailto:${garage.email}`} className="text-slate-700 dark:text-slate-200 hover:text-[#1E3A5F] dark:hover:text-white transition-colors truncate">
                    {garage.email}
                  </a>
                </div>
                {/* Only http(s) sites are linked: a stored javascript:/data: URL must never become a clickable href. */}
                {garage.website && /^https?:\/\//i.test(garage.website) && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                    <a href={garage.website} target="_blank" rel="noopener noreferrer" className="text-slate-700 dark:text-slate-200 hover:text-[#1E3A5F] dark:hover:text-white transition-colors truncate">
                      {garage.website}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <span className="text-slate-700 dark:text-slate-200">{garage.address}, {garage.city} {garage.postcode}</span>
                </div>
                <a
                  href={directionsUrl(garage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300"
                >
                  <Navigation className="h-4 w-4" />
                  Get directions
                </a>
              </div>
            </div>

            <div className="bg-[#F8FAFC] dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-white/10 p-5">
              <div className={`grid gap-3 ${garage.completedJobs ? "grid-cols-3" : "grid-cols-2"}`}>
                {[
                  { label: "Total Reviews", value: garage.totalReviews.toLocaleString() },
                  { label: "Avg Rating", value: `${garage.averageRating.toFixed(1)}★` },
                  ...(garage.completedJobs ? [{ label: "Jobs Completed", value: garage.completedJobs.toLocaleString() }] : []),
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-white/10">
                    <div className="text-xl font-bold text-[#1E3A5F] dark:text-white">{stat.value}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <QuoteRequestDialog
        open={showQuoteForm}
        onOpenChange={setShowQuoteForm}
        garageId={garage.id}
        garageSlug={garage.slug}
        offeredServices={garage.services}
        terms={garage.quoteTerms}
        initialService={initialService}
        initialReg={initialReg}
        isSignedIn={!!user}
        isOwner={user?.role === "OWNER"}
      />
    </div>
  )
}
