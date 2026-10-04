import { Suspense } from "react"
import { redirect } from "next/navigation"
import { legacyGarageRedirect } from "@/lib/portal/links"
import { DashboardPage } from "@/components/garage-portal/dashboard/DashboardPage"

export const metadata = { title: "Dashboard" }

export default async function GarageDashboardRoute({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; quote?: string }>
}) {
  // Notifications/emails created before the portal link to /garage-dashboard?booking=ID (or ?quote=ID).
  const legacy = legacyGarageRedirect(await searchParams)
  if (legacy) redirect(legacy)

  // DashboardPage keeps the date range in the query string, which requires Suspense.
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  )
}
