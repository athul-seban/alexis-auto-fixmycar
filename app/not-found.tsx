import Link from "next/link"
import { Wrench, Search, Home } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="min-h-[70vh] flex items-center justify-center bg-[#F8FAFC] px-4 py-20">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wrench className="h-10 w-10 text-[#F97316]" />
          </div>
          <div className="text-6xl font-black text-[#1E3A5F] mb-3">404</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Page not found</h1>
          <p className="text-slate-500 mb-8">
            The page you&apos;re looking for doesn&apos;t exist or may have moved. Let&apos;s get you back on track.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 bg-[#1E3A5F] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              <Home className="h-4 w-4" />
              Back to Home
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center justify-center gap-2 border-2 border-slate-200 text-slate-700 font-semibold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Search className="h-4 w-4" />
              Find a Garage
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
