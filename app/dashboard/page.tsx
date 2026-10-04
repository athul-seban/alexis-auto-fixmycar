import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { OwnerOverviewPage } from "@/components/owner-portal/OverviewPage"
import { authOptions } from "@/lib/auth"

export const metadata = { title: { absolute: "Overview · My account" } }

// Old notification links point at /dashboard?booking=ID or ?quote=ID; send them to the matching page.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ booking?: string; quote?: string }> }) {
  const params = await searchParams
  if (params.booking) redirect("/dashboard/bookings")
  if (params.quote) redirect("/dashboard/quotes")

  const session = await getServerSession(authOptions)
  const name = (session?.user as { name?: string | null } | undefined)?.name
  return <OwnerOverviewPage firstName={name?.split(" ")[0] ?? "there"} />
}
