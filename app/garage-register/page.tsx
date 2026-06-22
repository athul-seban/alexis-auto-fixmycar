"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Wrench, CheckCircle, AlertCircle, Building2, MapPin, Phone, Mail, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
  { value: "ELECTRIC_SERVICE", label: "EV Service" },
]

export default function GarageRegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    // Account
    name: "", email: "", password: "", phone: "",
    // Garage
    garageName: "", garagePhone: "", garageEmail: "", address: "",
    city: "", postcode: "", description: "", isMobile: false,
    // Services
    services: [] as string[],
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement
    const value = target.type === "checkbox" ? target.checked : target.value
    setForm((prev) => ({ ...prev, [e.target.name]: value }))
  }

  const toggleService = (value: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(value)
        ? prev.services.filter((s) => s !== value)
        : [...prev.services, value],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/garages/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Registration failed")
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl p-10 shadow-lg border border-gray-200">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Application Submitted!</h2>
          <p className="text-slate-600 mb-2">Your garage has been submitted for review. Our team will verify your details and approve your listing within 24-48 hours.</p>
          <p className="text-sm text-slate-400 mb-6">You&apos;ll receive a confirmation email at <strong>{form.garageEmail}</strong>.</p>
          <Link href="/">
            <Button variant="primary" size="lg" className="w-full">Back to Home</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#1E3A5F] py-6">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <Wrench className="h-6 w-6 text-white" />
            <span className="text-xl font-bold text-white">Fix<span className="text-[#F97316]">MyCar</span></span>
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Register Your Garage</h1>
          <p className="text-blue-200 text-sm">Join 15,000+ garages. Free to register. No monthly fees.</p>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex items-center gap-2 flex-1 ${s < 3 ? "after:flex-1 after:h-0.5 after:bg-gray-200 after:ml-2" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${step >= s ? "bg-[#F97316] text-white" : "bg-gray-200 text-slate-500"}`}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${step >= s ? "text-slate-900" : "text-slate-400"}`}>
                {s === 1 ? "Your Account" : s === 2 ? "Garage Details" : "Services"}
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={step < 3 ? (e) => { e.preventDefault(); setStep(s => s + 1) } : handleSubmit}>
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
                  <Building2 className="h-5 w-5 text-[#F97316]" /> Your Account
                </h2>
                <Input label="Your full name" name="name" value={form.name} onChange={handleChange} placeholder="John Smith" required />
                <Input label="Email address" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@garage.com" required />
                <Input label="Mobile number" type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="07700 900000" required />
                <Input label="Password" type="password" name="password" value={form.password} onChange={handleChange} placeholder="Min. 8 characters" required hint="At least 8 characters" />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#F97316]" /> Garage Details
                </h2>
                <Input label="Garage name" name="garageName" value={form.garageName} onChange={handleChange} placeholder="Premier Auto Services" required />
                <Input label="Garage phone" type="tel" name="garagePhone" value={form.garagePhone} onChange={handleChange} placeholder="020 7123 4567" required />
                <Input label="Garage email" type="email" name="garageEmail" value={form.garageEmail} onChange={handleChange} placeholder="info@yourgarage.com" required />
                <Input label="Street address" name="address" value={form.address} onChange={handleChange} placeholder="123 High Street" required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="City/Town" name="city" value={form.city} onChange={handleChange} placeholder="London" required />
                  <Input label="Postcode" name="postcode" value={form.postcode} onChange={handleChange} placeholder="SW1A 1AA" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">About your garage</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Describe your garage, specialisms, experience..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
                  />
                </div>
                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="isMobile"
                    checked={form.isMobile}
                    onChange={handleChange}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Mobile mechanic</div>
                    <div className="text-xs text-slate-500">I travel to customers&apos; locations</div>
                  </div>
                </label>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-[#F97316]" /> Services Offered
                </h2>
                <p className="text-slate-500 text-sm mb-5">Select all services your garage provides</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {serviceOptions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleService(s.value)}
                      className={`p-3 rounded-lg border text-sm font-medium text-left transition-all cursor-pointer ${
                        form.services.includes(s.value)
                          ? "border-[#F97316] bg-orange-50 text-[#F97316]"
                          : "border-gray-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {form.services.includes(s.value) && "✓ "}
                      {s.label}
                    </button>
                  ))}
                </div>
                {form.services.length === 0 && (
                  <p className="text-xs text-red-500 mt-2">Please select at least one service</p>
                )}
              </div>
            )}

            <div className="flex justify-between mt-8 pt-5 border-t border-gray-100">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)}>
                  Back
                </Button>
              )}
              <Button
                type="submit"
                loading={loading}
                disabled={step === 3 && form.services.length === 0}
                className={`gap-2 ${step === 1 ? "ml-auto" : ""}`}
                size="lg"
              >
                {step === 3 ? "Submit Application" : "Continue"}
                {step < 3 && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#1E3A5F] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
