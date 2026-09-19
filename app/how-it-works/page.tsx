import Link from "next/link"
import { ArrowRight, Search, MessageSquare, Wallet } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { HowItWorks } from "@/components/home/HowItWorks"

export const metadata = { title: "How It Works — Quote My Garage" }

const garageSteps = [
  {
    icon: Search,
    title: "Get discovered",
    description: "Car owners nearby searching for your services find your listing, ratings, and reviews.",
  },
  {
    icon: MessageSquare,
    title: "Send a quote",
    description: "Respond to job requests with a price and message. No cold calls, no chasing leads.",
  },
  {
    icon: Wallet,
    title: "Get booked and paid",
    description: "Once a customer accepts, the booking and payment are handled through the platform.",
  },
]

export default function HowItWorksPage() {
  return (
    <>
      <Header />
      <main>
        <section className="py-20 bg-[#1E3A5F] text-center">
          <div className="max-w-3xl mx-auto px-4">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
              How Quote My Garage Works
            </h1>
            <p className="text-blue-200/80 text-lg">
              Whether you&apos;re fixing a car or fixing cars for a living, here&apos;s how the platform works for you.
            </p>
          </div>
        </section>

        <HowItWorks />

        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <span className="inline-block text-[#1E3A5F] font-bold text-xs uppercase tracking-[0.15em] bg-blue-50 border border-blue-100 px-4 py-1.5 rounded-full mb-4">
                For Garages
              </span>
              <h2 className="text-3xl md:text-[2.6rem] font-extrabold text-slate-900 mb-4 tracking-tight">
                Running a Garage? Here&apos;s Your Side
              </h2>
              <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                Win local jobs without spending on ads or chasing leads.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {garageSteps.map((step, i) => (
                <div key={step.title} className="rounded-2xl p-7 border border-[#E8EDF5]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.04)" }}>
                  <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
                    <step.icon className="h-7 w-7 text-[#1E3A5F]" />
                  </div>
                  <div className="text-xs font-bold text-slate-400 mb-2">STEP {i + 1}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-500 leading-relaxed text-[15px]">{step.description}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link
                href="/for-garages"
                className="inline-flex items-center gap-2 text-[#F97316] font-bold hover:underline"
              >
                Learn more about listing your garage
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
