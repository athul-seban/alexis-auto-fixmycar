import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"
import { SiteRenderer } from "@/components/site/SiteRenderer"
import { authOptions } from "@/lib/auth"
import { can } from "@/lib/org/access"
import { orgFeatureEnabled } from "@/lib/org/features"
import { resolveActiveGarage } from "@/lib/org/resolve"
import { appOrigin } from "@/lib/site/public-cached"
import { buildPreviewSite } from "@/lib/site/public"
import { previewParts } from "@/lib/site/site-service"

// The owner's preview of their saved draft, as visitors would see it once published. Opens in its own tab, outside the
// portal's sidebar, and is never indexed. Only someone who may edit the website can open it.

export const metadata: Metadata = { title: "Website preview", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function SitePreviewPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) redirect("/login?callbackUrl=/site-preview")
  if (user.role !== "GARAGE") notFound()

  const resolved = await resolveActiveGarage(user.id)
  if (!resolved.ok) notFound()
  const { organisation, access } = resolved.value
  if (!organisation || !orgFeatureEnabled("sites", organisation.id) || !can(access, "website.edit")) notFound()

  const parts = await previewParts({ organisation, actor: { id: user.id, email: null } })
  const site = await buildPreviewSite({ siteId: parts.siteId, organisationId: organisation.id, businessName: organisation.name, logo: parts.logo, theme: parts.theme, content: parts.content })
  return <SiteRenderer site={site} appOrigin={appOrigin()} preview />
}
