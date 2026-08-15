"use client"

import { useState } from "react"
import Link from "next/link"
import { Wrench, CheckCircle, AlertCircle, Car, User, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getServiceLabel } from "@/lib/utils"

const serviceOptions = [
  { value: "MOT", label: "MOT Test" },
  { value: "FULL_SERVICE", label: "Full Service" },
  { value: "INTERIM_SERVICE", label: "Interim Service" },
  { value: "BRAKES", label: "Brakes" },
  { value: "TYRES", label: "Tyres" },
  { value: "REPAIR", label: "Engine Repair" },
  { value: "DIAGNOSTICS", label: "Diagnostics" },
  { value: "CLUTCH", label: "Clutch" },
  { value: "CAMBELT", label: "Cambelt" },
  { value: "EXHAUST", label: "Exhaust" },
  { value: "BATTERY", label: "Battery" },
  { value: "WINDSCREEN", label: "Windscreen" },
  { value: "AIR_CON", label: "Air Con" },
]

const fuelOptions = ["Petrol", "Diesel", "Hybrid", "Electric"]

interface JobRequestResult {
  jobRequest: { token: string }
  matchedGarageCount: number
}

export default function PostJobPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<JobRequestResult | null>(null)

  const [form, setForm] = useState({
    registration: "", make: "", model: "", year: "", fuel: "", mileage: "",
    serviceType: "", description: "", city: "", postcode: "",
    isMobilePreferred: false, preferredDate: "",
    guestName: "", guestEmail: "", guestPhone: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement
    const value = target.type === "checkbox" ? target.checked : target.value
    setForm((prev) => ({ ...prev, [e.target.name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/job-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          year: parseInt(form.year, 10),
          mileage: form.mileage ? parseInt(form.mileage, 10) : undefined,
          fuel: form.fuel || undefined,
          preferredDate: form.preferredDate ? new Date(form.preferredDate).toISOString() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Something went wrong")
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl p-10 shadow-lg border border-gray-200">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Your request is live!</h2>
          <p className="text-slate-600 mb-2">
            {result.matchedGarageCount > 0
              ? `We've notified ${result.matchedGarageCount} garage${result.matchedGarageCount === 1 ? "" : "s"} near you.`
              : "We're still finding garages near you — check back soon."}
          </p>
          <p className="text-sm text-slate-400 mb-6">
            We also emailed this tracking link to <strong>{form.guestEmail}</strong> — no account needed.
          </p>
          <Link href={`/post-job/track/${result.jobRequest.token}`}>
            <Button variant="primary" size="lg" className="w-full">Track My Quotes</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="bg-[#1E3A5F] py-6">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <Wrench className="h-6 w-6 text-white" />
            <span className="text-xl font-bold text-white">Quote<span className="text-[#F97316]">MyGarage</span></span>
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Post a Job</h1>
          <p className="text-blue-200 text-sm">Tell us what you need once — get quotes emailed to you. No account required.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex items-center gap-2 flex-1 ${s < 3 ? "after:flex-1 after:h-0.5 after:bg-gray-200 after:ml-2" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${step >= s ? "bg-[#F97316] text-white" : "bg-gray-200 text-slate-500"}`}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${step >= s ? "text-slate-900" : "text-slate-400"}`}>
                {s === 1 ? "Vehicle" : s === 2 ? "Job Details" : "Your Details"}
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={step < 3 ? (e) => { e.preventDefault(); setStep((s) => s + 1) } : handleSubmit}>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
                  <Car className="h-5 w-5 text-[#F97316]" /> Your Vehicle
                </h2>
                <Input label="Registration" name="registration" value={form.registration} onChange={handleChange} placeholder="AB12 CDE" required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Make" name="make" value={form.make} onChange={handleChange} placeholder="Ford" required />
                  <Input label="Model" name="model" value={form.model} onChange={handleChange} placeholder="Focus" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Year" type="number" name="year" value={form.year} onChange={handleChange} placeholder="2019" required />
                  <Input label="Mileage (optional)" type="number" name="mileage" value={form.mileage} onChange={handleChange} placeholder="45000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fuel type (optional)</label>
                  <select
                    name="fuel"
                    value={form.fuel}
                    onChange={handleChange}
                    className="w-full h-11 px-4 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                  >
                    <option value="">Select fuel type</option>
                    {fuelOptions.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-[#F97316]" /> Job Details
                </h2>
                <p className="text-slate-500 text-sm mb-3">What does your car need?</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {serviceOptions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, serviceType: s.value }))}
                      className={`p-3 rounded-lg border text-sm font-medium text-left transition-all cursor-pointer ${
                        form.serviceType === s.value
                          ? "border-[#F97316] bg-orange-50 text-[#F97316]"
                          : "border-gray-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {form.serviceType === s.value && "✓ "}
                      {s.label}
                    </button>
                  ))}
                </div>
                {!form.serviceType && (
                  <p className="text-xs text-red-500">Please select a service</p>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Describe the job</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    placeholder="e.g. Car making a grinding noise when braking..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
                    required
                    minLength={10}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City/Town" name="city" value={form.city} onChange={handleChange} placeholder="London" required />
                  <Input label="Postcode" name="postcode" value={form.postcode} onChange={handleChange} placeholder="SW1A 1AA" required />
                </div>
                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="isMobilePreferred"
                    checked={form.isMobilePreferred}
                    onChange={handleChange}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Prefer a mobile mechanic</div>
                    <div className="text-xs text-slate-500">Only notify garages that come to you</div>
                  </div>
                </label>
                <Input label="Preferred date (optional)" type="date" name="preferredDate" value={form.preferredDate} onChange={handleChange} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
                  <User className="h-5 w-5 text-[#F97316]" /> Your Details
                </h2>
                <Input label="Full name" name="guestName" value={form.guestName} onChange={handleChange} placeholder="John Smith" required />
                <Input label="Email address" type="email" name="guestEmail" value={form.guestEmail} onChange={handleChange} placeholder="you@example.com" required hint="We'll send your quotes here" />
                <Input label="Mobile number" type="tel" name="guestPhone" value={form.guestPhone} onChange={handleChange} placeholder="07700 900000" required />

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800 mb-1">{form.serviceType && getServiceLabel(form.serviceType)}</p>
                  <p>{form.year} {form.make} {form.model} · {form.registration}</p>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-5 border-t border-gray-100">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              <Button
                type="submit"
                loading={loading}
                disabled={step === 2 && !form.serviceType}
                className={`gap-2 ${step === 1 ? "ml-auto" : ""}`}
                size="lg"
              >
                {step === 3 ? "Get My Quotes" : "Continue"}
                {step < 3 && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
