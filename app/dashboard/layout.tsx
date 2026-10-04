import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { roleHome } from "@/lib/auth-routes"
import { ownerNavBadges } from "@/lib/portal/nav-badges"
import { PortalShell } from "@/components/portal-shell/PortalShell"

export const metadata = {
  title: { template: "%s · My account", default: "My account" },
  robots: { index: false, follow: false },
}

// Sidebar shell for the customer account. Garages and admins are sent to their own portals.
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login?callbackUrl=/dashboard")

  const user = session.user as { id: string; role?: string; name?: string | null; email?: string | null }
  if (user.role !== "OWNER") redirect(roleHome(user.role))

  return (
    <PortalShell
      portal="owner"
      user={{ name: user.name ?? null, email: user.email ?? null }}
      identity={{ name: user.name ?? "My account" }}
      badges={await ownerNavBadges(user.id)}
    >
      {children}
    </PortalShell>
  )
}
