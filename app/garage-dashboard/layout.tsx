import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { Store } from "lucide-react"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { roleHome } from "@/lib/auth-routes"
import { garageNavBadges } from "@/lib/portal/nav-badges"
import { PortalShell } from "@/components/portal-shell/PortalShell"
import { EmptyState } from "@/components/ui/empty-state"

export const metadata = {
  title: { template: "%s · Garage Portal", default: "Garage Portal" },
  robots: { index: false, follow: false },
}

// Sidebar + topbar shell for every /garage-dashboard/* page (no marketing Header/Footer).
// This guard only shapes the page; real authorisation is enforced per-request by proxy.ts
// (routes) and requireGarage() (APIs), because layouts don't re-run on client navigation.
export default async function GaragePortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login?callbackUrl=/garage-dashboard")

  const user = session.user as { id: string; role?: string; name?: string | null; email?: string | null; image?: string | null }
  if (user.role !== "GARAGE") redirect(roleHome(user.role))

  const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
  const badges = garage ? await garageNavBadges(garage) : undefined

  return (
    <PortalShell
      portal="garage"
      user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }}
      identity={{ name: garage?.name ?? "Garage Portal", logo: garage?.logo }}
      garageStatus={garage?.status}
      badges={badges}
    >
      {garage ? (
        children
      ) : (
        <EmptyState
          icon={Store}
          title="No garage profile yet"
          description="Your account is a garage account but no garage has been set up. Register your garage to start using the portal."
        />
      )}
    </PortalShell>
  )
}
