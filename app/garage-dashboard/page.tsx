import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GarageDashboard } from "@/components/dashboard/garage/GarageDashboard"
import { authOptions } from "@/lib/auth"

export const metadata = { title: "Garage Dashboard" }

export default async function GarageDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login?callbackUrl=/garage-dashboard")

  const user = session.user as any
  if (user.role !== "GARAGE") redirect("/dashboard")

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC]">
        <GarageDashboard user={user} />
      </main>
      <Footer />
    </>
  )
}
