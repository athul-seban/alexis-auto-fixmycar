import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { ManageBooking } from "@/components/booking/ManageBooking"

// The URL contains a secret: keep it out of search indexes and referrers.
export const metadata = { title: "Your booking", robots: { index: false, follow: false }, referrer: "no-referrer" as const }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 dark:bg-slate-950">
        <ManageBooking token={token} />
      </main>
      <Footer />
    </>
  )
}
