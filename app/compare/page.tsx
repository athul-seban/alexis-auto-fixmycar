import { Suspense } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { CompareView } from "@/components/compare/CompareView"

export const metadata = {
  title: "Compare Garages",
  robots: { index: false, follow: false },
}

export default function ComparePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <Suspense fallback={<CompareSkeleton />}>
          <CompareView />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

function CompareSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
    </div>
  )
}
