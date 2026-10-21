import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/roles"
import { AdminSettingsPage } from "@/components/admin/SettingsPage"

export const metadata = { title: "Platform settings" }

// Super admins only. The layout has already required an admin; ordinary admins go back to the overview.
export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!isSuperAdmin((session?.user as { role?: string } | undefined)?.role)) redirect("/admin")
  return <AdminSettingsPage />
}
