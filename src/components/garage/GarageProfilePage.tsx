"use client"

import { useState } from "react"
import Link from "next/link"
import {
  MapPin, Star, Shield, Phone, Mail, Globe, Clock, Car,
  ChevronLeft, MessageSquare, Calendar, CheckCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getServiceLabel } from "@/lib/utils"

const mockGarage = {
  id: "1",
  name: "Premier Auto Services",
  slug: "premier-auto-services",
  description: "Family-run garage with 20+ years of experience. We specialise in all makes and models, from small hatchbacks to large SUVs. Our team of fully qualified technicians are committed to providing the highest quality service at the most competitive prices in the area. We're proud members of the Good Garage Scheme and all our work is fully guaranteed.",
  logo: null,
  images: [],
  phone: "020 7123 4567",
  email: "info@premierauto.com",
  website: "https://premierauto.com",
  address: "123 High Street",
  city: "London",
  postcode: "SW1A 1AA",
  status: "APPROVED" as const,
  isVerified: true,
  isMobile: false,
  services: ["MOT", "FULL_SERVICE", "INTERIM_SERVICE", "BRAKES", "TYRES", "REPAIR", "DIAGNOSTICS"] as any[],
  openingHours: {
    monday: { open: true, from: "08:00", to: "18:00" },
    tuesday: { open: true, from: "08:00", to: "18:00" },
    wednesday: { open: true, from: "08:00", to: "18:00" },
    thursday: { open: true, from: "08:00", to: "18:00" },
    friday: { open: true, from: "08:00", to: "17:30" },
    saturday: { open: true, from: "09:00", to: "14:00" },
    sunday: { open: false, from: "", to: "" },
  },
  totalReviews: 342,
  averageRating: 4.9,
  totalBookings: 1205,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockReviews = [
  { id: "1", rating: 5, title: "Excellent service!", comment: "Absolutely fantastic. Fast, professional and very fairly priced. Fixed my brakes same day. Highly recommended!", owner: { name: "Sarah M.", image: null }, createdAt: new Date("2024-01-15"), service: "Brake Replacement" },
  { id: "2", rating: 5, title: "Best garage in London", comment: "Used them for my full service and MOT. Transparent pricing, no hidden extras. Will definitely return.", owner: { name: "James P.", image: null }, createdAt: new Date("2024-01-10"), service: "MOT + Full Service" },
  { id: "3", rating: 4, title: "Very professional", comment: "Diagnosed the issue quickly and fixed it at a reasonable price. Kept me updated throughout. Good communication.", owner: { name: "Emma T.", image: null }, createdAt: new Date("2024-01-05"), service: "Engine Diagnostics" },
  { id: "4", rating: 5, title: "Saved me a fortune!", comment: "Quoted me £400 less than the dealership for the same cambelt job. Quality work, no issues at all.", owner: { name: "David C.", image: null }, createdAt: new Date("2023-12-28"), service: "Cambelt Replacement" },
]

interface Props {
  slug: string
}

export function GarageProfilePage({ slug }: Props) {
  const [activeTab, setActiveTab] = useState<"services" | "reviews" | "info">("services")
  const [showQuoteForm, setShowQuoteForm] = useState(false)

  const garage = mockGarage
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

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
            <div className="w-20 h-20 rounded-xl bg-white flex items-center justify-center text-[#1E3A5F] font-bold text-2xl flex-shrink-0">
              {garage.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
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
              </div>
              <div className="flex flex-wrap items-center gap-4 text-blue-200 text-sm">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {garage.address}, {garage.city} {garage.postcode}
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`h-4 w-4 ${i <= Math.round(garage.averageRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-500"}`} />
                    ))}
                  </div>
                  <span className="font-bold text-white">{garage.averageRating}</span>
                  <span>({garage.totalReviews} reviews)</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="white" size="lg" className="gap-2">
                <Phone className="h-4 w-4" />
                Call
              </Button>
              <Button size="lg" className="gap-2" onClick={() => setShowQuoteForm(true)}>
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
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200">
              {(["services", "reviews", "info"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "bg-[#1E3A5F] text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab === "reviews" ? `Reviews (${garage.totalReviews})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === "services" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-1">About</h2>
                <p className="text-slate-600 leading-relaxed mb-6">{garage.description}</p>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Services Offered</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {garage.services.map((s: string) => (
                    <div key={s} className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700">{getServiceLabel(s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "reviews" && (
              <div className="space-y-4">
                {/* Rating summary */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-slate-900">{garage.averageRating}</div>
                      <div className="flex justify-center mt-1">
                        {[1,2,3,4,5].map((i) => (
                          <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">{garage.totalReviews} reviews</div>
                    </div>
                    <div className="flex-1">
                      {[5,4,3,2,1].map((stars) => {
                        const pct = stars === 5 ? 78 : stars === 4 ? 15 : stars === 3 ? 4 : stars === 2 ? 2 : 1
                        return (
                          <div key={stars} className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-slate-500 w-3">{stars}</span>
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 w-6">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {mockReviews.map((review) => (
                  <div key={review.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {review.owner.name.split(" ").map((w) => w[0]).join("")}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{review.owner.name}</p>
                          <p className="text-xs text-slate-500">{review.service}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex">
                          {[1,2,3,4,5].map((i) => (
                            <Star key={i} className={`h-4 w-4 ${i <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">{review.createdAt.toLocaleDateString("en-GB")}</span>
                      </div>
                    </div>
                    {review.title && <p className="font-semibold text-slate-900 text-sm mb-1">{review.title}</p>}
                    <p className="text-sm text-slate-600 leading-relaxed">{review.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "info" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-5">Opening Hours</h2>
                <div className="space-y-2">
                  {days.map((day) => {
                    const hours = (garage.openingHours as any)?.[day]
                    return (
                      <div key={day} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm font-medium text-slate-700 capitalize w-28">{day}</span>
                        {hours?.open ? (
                          <span className="text-sm text-slate-600">{hours.from} – {hours.to}</span>
                        ) : (
                          <span className="text-sm text-red-500 font-medium">Closed</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Get Quote CTA */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-slate-900 mb-3">Request a Free Quote</h3>
              <p className="text-sm text-slate-500 mb-4">Get a no-obligation quote from this garage. Usually responds within 1 hour.</p>
              <Button className="w-full gap-2" size="lg" onClick={() => setShowQuoteForm(true)}>
                <MessageSquare className="h-4 w-4" />
                Get Free Quote
              </Button>
              <Button variant="outline" className="w-full gap-2 mt-2" size="lg">
                <Calendar className="h-4 w-4" />
                Book Appointment
              </Button>
            </div>

            {/* Contact */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-slate-900 mb-4">Contact Info</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <a href={`tel:${garage.phone}`} className="text-slate-700 hover:text-[#1E3A5F] transition-colors">
                    {garage.phone}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <a href={`mailto:${garage.email}`} className="text-slate-700 hover:text-[#1E3A5F] transition-colors truncate">
                    {garage.email}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-[#F97316] flex-shrink-0" />
                  <span className="text-slate-700">{garage.address}, {garage.city} {garage.postcode}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-[#F8FAFC] rounded-xl border border-gray-200 p-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Total Reviews", value: garage.totalReviews.toLocaleString() },
                  { label: "Avg Rating", value: `${garage.averageRating}★` },
                  { label: "Jobs Completed", value: garage.totalBookings.toLocaleString() },
                  { label: "Response Time", value: "< 1hr" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-3 bg-white rounded-lg border border-gray-100">
                    <div className="text-xl font-bold text-[#1E3A5F]">{stat.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
