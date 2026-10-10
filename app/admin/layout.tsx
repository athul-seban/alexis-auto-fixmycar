import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { roleHome } from "@/lib/auth-routes"
import { adminNavBadges } from "@/lib/portal/nav-badges"
import { PortalShell } from "@/components/portal-shell/PortalShell"

export const metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
}

// Shell for every /admin/* page. Real authorisation is proxy.ts (routes) and each /api/admin/* handler.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login?callbackUrl=/admin")

  const user = session.user as { role?: string; name?: string | null; email?: string | null; image?: string | null }
  if (user.role !== "ADMIN") redirect(roleHome(user.role))

  return (
    <PortalShell portal="admin" user={{ name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }} identity={{ name: "Admin" }} badges={await adminNavBadges()}>
      {children}
    </PortalShell>
  )
}
