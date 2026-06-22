import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { AdminDashboard } from "@/components/admin/AdminDashboard"
import { authOptions } from "@/lib/auth"

export const metadata = { title: "Admin Dashboard" }

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const user = session.user as any
  if (user.role !== "ADMIN") redirect("/")

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-950">
        <AdminDashboard user={user} />
      </main>
    </>
  )
}
