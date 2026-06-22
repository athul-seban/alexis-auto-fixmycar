import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { OwnerDashboard } from "@/components/dashboard/owner/OwnerDashboard"
import { authOptions } from "@/lib/auth"

export const metadata = { title: "My Dashboard" }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login?callbackUrl=/dashboard")

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <OwnerDashboard user={session.user as any} />
      </main>
      <Footer />
    </>
  )
}
