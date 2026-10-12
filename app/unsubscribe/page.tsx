import type { Metadata } from "next"
import { Suspense } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { UnsubscribeForm } from "@/components/shared/UnsubscribeForm"

// A private, one-purpose page: never indexed, and the link's token must not leak through the Referer header.
export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function UnsubscribePage() {
  return (
    <>
      <Header />
      <main className="min-h-[60vh] bg-[#F8FAFC] px-4 py-16 dark:bg-slate-950">
        <Suspense>
          <UnsubscribeForm />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
