import Link from "next/link"
import {
  CheckCircle, ArrowRight, Zap, TrendingUp, Users, Clock,
  ClipboardList, MessageSquare, Wallet, ShieldCheck,
} from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export const metadata = { title: "For Garages — Quote My Garage" }

const benefits = [
  "Free to register — no monthly fees, ever",
  "Access thousands of local job requests daily",
  "Verified badge builds instant customer trust",
  "Manage all quotes and bookings in one place",
  "Get paid quickly and securely after each job",
]

const stats = [
  { value: "£2,500+", label: "Avg monthly revenue", icon: TrendingUp, color: "#10B981" },
  { value: "48hrs", label: "Time to first booking", icon: Clock, color: "#3B82F6" },
  { value: "15K+", label: "Garages on platform", icon: Users, color: "#F97316" },
  { value: "Free", label: "To join and list", icon: Zap, color: "#8B5CF6" },
]

const steps = [
  {
    icon: ClipboardList,
    title: "Create your free listing",
    description: "Register in minutes: your garage details, services offered, and coverage area. No credit card, no setup fee.",
  },
  {
    icon: MessageSquare,
    title: "Receive local job requests",
    description: "Get matched with car owners in your area searching for exactly the services you provide. Quote directly through the platform.",
  },
  {
    icon: Wallet,
    title: "Win the job and get paid",
    description: "Customers book and pay through Quote My Garage. You focus on the work — we handle the admin.",
  },
]

export default function ForGaragesPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section
          className="py-24 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 40%, #1E3A5F 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-blue-500/8 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span
              className="inline-block text-xs font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full mb-6"
              style={{ background: "rgba(249, 115, 22, 0.15)", color: "#FB923C", border: "1px solid rgba(249, 115, 22, 0.25)" }}
            >
              For Garage Owners
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-5 leading-[1.15] tracking-tight">
              Grow Your Garage Business
              <br />
              <span
                style={{
                  backgroundImage: "linear-gradient(90deg, #F97316, #FDBA74)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                with Quote My Garage
              </span>
            </h1>
            <p className="text-blue-200/80 text-lg mb-8 leading-relaxed max-w-2xl mx-auto">
              Join <strong className="text-white">15,000+ garages</strong> already on Quote My Garage.
              Reach thousands of local customers searching for exactly the services you offer.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/garage-register"
                className="inline-flex items-center gap-2.5 text-white font-bold px-6 py-3.5 rounded-xl text-base transition-all duration-200 hover:opacity-90 hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)" }}
              >
                Register Your Garage Free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 font-semibold px-6 py-3.5 rounded-xl text-base transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
              >
                Already registered? Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-16 bg-[#F8FAFC]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-5">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${stat.color}1A`, border: `1px solid ${stat.color}30` }}
                >
                  <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                </div>
                <div className="text-2xl font-black text-slate-900 mb-1">{stat.value}</div>
                <div className="text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works for garages */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="inline-block text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] bg-orange-50 border border-orange-100 px-4 py-1.5 rounded-full mb-4">
                Simple Process
              </span>
              <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-4 tracking-tight">
                How It Works for Garages
              </h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                From sign-up to your first booking in as little as 48 hours.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {steps.map((step, i) => (
                <div key={step.title} className="rounded-2xl p-7 border border-[#E8EDF5]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.04)" }}>
                  <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-5">
                    <step.icon className="h-7 w-7 text-[#F97316]" />
                  </div>
                  <div className="text-xs font-bold text-slate-400 mb-2">STEP {i + 1}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-500 leading-relaxed text-[15px]">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-24 bg-[#F8FAFC]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Everything you need, nothing you don&apos;t
              </h2>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-8 sm:p-10">
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-4 w-4 text-[#F97316]" />
                    </div>
                    <span className="text-slate-700 text-[15px]">{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-8 border-t border-gray-100 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#1E3A5F] flex-shrink-0" />
                <p className="text-sm text-slate-500">
                  All garages are reviewed by our team before going live, so customers can trust every listing on the platform.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20" style={{ background: "linear-gradient(135deg, #0F1F3D 0%, #1E3A5F 100%)" }}>
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">Ready to grow your garage?</h2>
            <p className="text-blue-200/80 mb-8">Registration takes less than 5 minutes. No fees, ever.</p>
            <Link
              href="/garage-register"
              className="inline-flex items-center gap-2.5 text-white font-bold px-7 py-4 rounded-xl text-base transition-all duration-200 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)" }}
            >
              Register Your Garage Free
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
