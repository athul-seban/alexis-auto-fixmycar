import Link from "next/link"
import { headers } from "next/headers"
import { Wrench, Search, Home } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export default async function NotFound() {
  // On a business website's address (no marketplace providers there) show a plain page that doesn't pretend to be the
  // marketplace: the site isn't there, and that's all a visitor needs to know.
  if ((await headers()).has("x-qmg-site")) {
    const home = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">This website isn&apos;t available</h1>
        <p className="mb-6 max-w-md text-slate-600">The address may have been mistyped, or the website is offline at the moment.</p>
        <a href={home} className="rounded-lg bg-[#1E3A5F] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Find a garage on Quote My Garage
        </a>
      </main>
    )
  }

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
