import { Suspense } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { SearchResults } from "@/components/search/SearchResults"

export const metadata = {
  title: "Find Garages & Mechanics Near You",
  description: "Search and compare local garages, mobile mechanics, and dealerships in your area.",
}

export default function SearchPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <Suspense fallback={<SearchSkeleton />}>
          <SearchResults />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

function SearchSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="h-32 bg-slate-100 rounded-xl animate-pulse mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
        <div className="lg:col-span-3 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
