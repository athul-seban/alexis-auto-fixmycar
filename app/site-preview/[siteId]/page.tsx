import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import { SiteRenderer } from "@/components/site/SiteRenderer"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { appOrigin } from "@/lib/site/public-cached"
import { loadSiteForAdminPreview } from "@/lib/site/site-admin"

// A platform admin's view of a business's website draft, to review it before approving. Admin-only and never indexed.

export const metadata: Metadata = { title: "Website review", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function AdminSitePreviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) redirect("/login")
  if (!isAdmin(user.role)) notFound()

  const { siteId } = await params
  const site = await loadSiteForAdminPreview(siteId)
  if (!site) notFound()
  return <SiteRenderer site={site} appOrigin={appOrigin()} preview previewFor="admin" />
}
