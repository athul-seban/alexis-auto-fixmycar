import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit, type AuditActor } from "@/lib/audit"
import { notifyGarage } from "@/lib/notifications"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"
import { ALL_LOCATIONS } from "@/lib/org/access"
import { OrgError } from "@/lib/org/org-error"
import { invalidateSite } from "@/lib/site/cache"
import { parseContent } from "@/lib/site/content"
import { buildPreviewSite } from "@/lib/site/public"
import { publishForAdmin, siteAddress, siteReadiness } from "@/lib/site/site-service"
import { parseTheme } from "@/lib/site/theme"

// What a platform admin does with business websites: approve a site's first publish (or ask for changes), and switch any
// site off or back on. Admin routes check the role; this module applies the rules and tells the business.

export const siteActionSchema = z.discriminatedUnion("action", [
  z.object({ siteId: z.string().min(1).max(64), action: z.literal("approve") }),
  z.object({ siteId: z.string().min(1).max(64), action: z.literal("reject"), reason: z.string().trim().min(3, "Say what needs changing").max(500) }),
  z.object({ siteId: z.string().min(1).max(64), action: z.literal("disable"), reason: z.string().trim().min(3, "Give a reason").max(500) }),
  z.object({ siteId: z.string().min(1).max(64), action: z.literal("enable") }),
])
export type SiteAction = z.infer<typeof siteActionSchema>

export const SITE_STATUSES = ["PENDING_REVIEW", "PUBLISHED", "DRAFT", "REJECTED", "UNPUBLISHED"] as const

export interface AdminSiteRow {
  id: string
  organisationId: string
  businessName: string
  status: string
  label: string | null
  url: string | null
  submittedAt: string | null
  publishedAt: string | null
  disabled: boolean
  disabledReason: string | null
  rejectionReason: string | null
  locations: number
  liveLocations: number
  ownerEmail: string | null
  headline: string
}

export async function listSites(opts: { status: string; q?: string; page: number; pageSize: number }) {
  // There is one site per business, so the list is short: filter and page in memory (SQLite and Postgres disagree on
  // case-insensitive search anyway).
  const [rows, grouped] = await Promise.all([
    prisma.organisationSite.findMany({
      where: { status: opts.status },
      orderBy: [{ submittedAt: "asc" }, { updatedAt: "desc" }],
      include: {
        organisation: { select: { id: true, name: true, locations: { select: { status: true } }, memberships: { where: { status: "ACTIVE", assignments: { some: { scopeKey: ALL_LOCATIONS, role: { presetKey: OWNER_ROLE_KEY, isSystem: true } } } }, take: 1, select: { user: { select: { email: true } } } } } },
        domains: { where: { status: "ACTIVE" }, select: { host: true } },
      },
    }),
    prisma.organisationSite.groupBy({ by: ["status"], _count: { status: true } }),
  ])
  const needle = opts.q?.trim().toLowerCase()
  const filtered = needle ? rows.filter((s) => [s.organisation.name, s.domains[0]?.host ?? ""].some((f) => f.toLowerCase().includes(needle))) : rows
  const pageRows = filtered.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize)

  const counts: Record<string, number> = Object.fromEntries(SITE_STATUSES.map((s) => [s, 0]))
  for (const g of grouped) counts[g.status] = g._count.status

  const sites: AdminSiteRow[] = pageRows.map((s) => ({
    id: s.id,
    organisationId: s.organisationId,
    businessName: s.organisation.name,
    status: s.status,
    label: s.domains[0]?.host ?? null,
    url: s.domains[0] ? siteAddress(s.domains[0].host) : null,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    publishedAt: s.publishedAt?.toISOString() ?? null,
    disabled: s.disabledAt !== null,
    disabledReason: s.disabledAt ? s.disabledReason : null,
    rejectionReason: s.status === "REJECTED" ? s.rejectionReason : null,
    locations: s.organisation.locations.length,
    liveLocations: s.organisation.locations.filter((l) => l.status === "APPROVED").length,
    ownerEmail: s.organisation.memberships[0]?.user.email ?? null,
    headline: parseContent(s.draftContent ?? s.content, s.organisation.name).hero.headline,
  }))
  return { sites, total: filtered.length, counts, page: opts.page, pageSize: opts.pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / opts.pageSize)) }
}

/** What an admin reviews: the site's draft (or its published copy once nothing is pending) with the live locations. */
export async function loadSiteForAdminPreview(siteId: string) {
  const site = await prisma.organisationSite.findUnique({ where: { id: siteId }, include: { organisation: { select: { id: true, name: true } } } })
  if (!site) return null
  return buildPreviewSite({
    siteId: site.id,
    organisationId: site.organisationId,
    businessName: site.organisation.name,
    logo: site.logo,
    theme: parseTheme(site.draftTheme ?? site.theme),
    content: parseContent(site.draftContent ?? site.content, site.organisation.name),
  })
}

/** Tell the business, through its oldest location (notifications belong to a location). Never throws. */
async function tell(organisationId: string, title: string, body: string): Promise<void> {
  try {
    const first = await prisma.garage.findFirst({ where: { organisationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
    if (first) await notifyGarage({ garageId: first.id, type: "GARAGE_STATUS_CHANGED", title, body, link: "/garage-dashboard/site" })
  } catch (err) {
    console.error("[site-admin] couldn't notify the business:", (err as Error).message)
  }
}

/** Apply one admin decision. Throws OrgError for anything that isn't allowed. */
export async function applySiteAction(admin: AuditActor, adminId: string | null, input: SiteAction) {
  const site = await prisma.organisationSite.findUnique({ where: { id: input.siteId }, include: { organisation: { select: { id: true, name: true } } } })
  if (!site) throw new OrgError("NOT_FOUND", "Website not found.")
  const org = site.organisation

  switch (input.action) {
    case "approve": {
      if (site.status !== "PENDING_REVIEW") throw new OrgError("CONFLICT", "Only a website that is waiting for review can be approved.")
      // A site that couldn't go live (no live location, missing text) must not be approved: it would publish nothing useful.
      const active = await prisma.siteDomain.findFirst({ where: { siteId: site.id, status: "ACTIVE" }, select: { host: true } })
      const problems = await siteReadiness(site, org.id, parseContent(site.draftContent ?? site.content, org.name), active?.host ?? null)
      if (problems.length > 0) throw new OrgError("NOT_READY", `This website can't go live yet: ${problems[0]}`, { problems })
      await prisma.$transaction(async (tx) => {
        await tx.organisationSite.update({ where: { id: site.id }, data: { approvedAt: new Date(), approvedById: adminId } })
        await publishForAdmin(tx, site, org.name, adminId, "Approved by Quote My Garage")
      })
      await audit(admin, { action: "SITE_APPROVED", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: org.name })
      await tell(org.id, "Your website is live", active ? `Your website was approved and is live at ${siteAddress(active.host) ?? active.host}.` : "Your website was approved and is live.")
      break
    }
    case "reject": {
      if (site.status !== "PENDING_REVIEW") throw new OrgError("CONFLICT", "Only a website that is waiting for review can be sent back.")
      await prisma.organisationSite.update({ where: { id: site.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: input.reason } })
      await audit(admin, { action: "SITE_REJECTED", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: `${org.name}: ${input.reason}` })
      await tell(org.id, "Your website needs changes", `Reason: ${input.reason}. Update it and send it again.`)
      break
    }
    case "disable": {
      if (site.disabledAt) throw new OrgError("CONFLICT", "That website is already switched off.")
      await prisma.organisationSite.update({ where: { id: site.id }, data: { disabledAt: new Date(), disabledReason: input.reason } })
      await audit(admin, { action: "SITE_DISABLED", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: `${org.name}: ${input.reason}` })
      await tell(org.id, "Your website has been switched off", `Reason: ${input.reason}. Contact support to resolve this.`)
      break
    }
    case "enable": {
      if (!site.disabledAt) throw new OrgError("CONFLICT", "That website isn't switched off.")
      await prisma.organisationSite.update({ where: { id: site.id }, data: { disabledAt: null, disabledReason: null } })
      await audit(admin, { action: "SITE_ENABLED", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: org.name })
      await tell(org.id, "Your website is back on", "Your website has been switched back on.")
      break
    }
  }
  await invalidateSite(org.id)
  return prisma.organisationSite.findUniqueOrThrow({ where: { id: site.id }, select: { id: true, status: true, disabledAt: true } })
}
