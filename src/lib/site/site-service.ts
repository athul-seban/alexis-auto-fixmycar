import type { OrganisationSite, Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { GarageContext } from "@/lib/garage-auth"
import { isOwnOrgImageUrl } from "@/lib/image-sniff"
import { OrgError } from "@/lib/org/org-error"
import { siteOrigin } from "@/lib/org/host"
import { parseLabel, subdomainProblem, suggestLabel } from "@/lib/org/subdomain"
import { invalidateSite } from "@/lib/site/cache"
import { contentProblems, defaultContent, parseContent, publishProblems, siteContentSchema, type SiteContent } from "@/lib/site/content"
import { DEFAULT_THEME, parseTheme, themeSchema, type SiteTheme } from "@/lib/site/theme"
import { contentForTier, mergeSavedContent, siteTier, type SiteTier } from "@/lib/site/tier"

// A business's website: edit a draft, choose an address, send it for review the first time, publish (later edits go live
// straight away), roll back, take it down. Every rule lives here; the routes only authorise and call.
//
//   DRAFT --submit--> PENDING_REVIEW --admin approves--> PUBLISHED <--> UNPUBLISHED
//                          |--admin rejects--> REJECTED --submit again--> PENDING_REVIEW
//   (once a site has been approved, publishing again never needs review)
//   A platform admin can also switch any site off (disabledAt), whatever its status.

type Ctx = Pick<GarageContext, "organisation" | "actor">

export const MAX_REVISIONS = 20
/** Labels a site may have had in total (the live one plus redirecting old ones): keeps address-hopping in check. */
export const MAX_LABELS_PER_SITE = 5

export const saveDraftSchema = z
  .object({
    /** The version the editor loaded; if someone saved since, the save is refused instead of overwriting their work. */
    expectedVersion: z.number().int().min(1),
    theme: themeSchema.optional(),
    content: siteContentSchema.optional(),
    /** The logo: an upload of this business's, or null to remove it. */
    logo: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.theme !== undefined || d.content !== undefined || d.logo !== undefined, "Nothing to save")
export type SaveDraftInput = z.infer<typeof saveDraftSchema>

function business(ctx: Ctx) {
  if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet. Ask support to run the upgrade.")
  return ctx.organisation
}

const rootDomain = () => process.env.NEXT_PUBLIC_ROOT_DOMAIN
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL
export const siteAddress = (label: string): string | null => siteOrigin(label, rootDomain(), appUrl())

// ---- creating and reading the site ----------------------------------------------------------------------------------

/** The first free label from a suggestion ("acme-motors", "acme-motors-2", ...), or null when the name gives nothing usable. */
async function freeLabel(db: Prisma.TransactionClient | typeof prisma, name: string): Promise<string | null> {
  const base = suggestLabel(name)
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 36)}-${n}`
    if (subdomainProblem(candidate) !== null) {
      if (n === 1) return null // the name itself can't be a label; the owner chooses one
      continue
    }
    if (!(await db.siteDomain.findUnique({ where: { host: candidate }, select: { id: true } }))) return candidate
  }
  return null
}

/** The business's site, created (as a draft with starter text and a suggested address) the first time it is needed. */
export async function ensureSite(organisationId: string, businessName: string): Promise<OrganisationSite> {
  const existing = await prisma.organisationSite.findUnique({ where: { organisationId } })
  if (existing) return existing
  try {
    return await prisma.$transaction(async (tx) => {
      const site = await tx.organisationSite.create({
        data: { organisationId, draftContent: JSON.stringify(defaultContent(businessName)), draftTheme: JSON.stringify(DEFAULT_THEME) },
      })
      const label = await freeLabel(tx, businessName)
      if (label) await tx.siteDomain.create({ data: { siteId: site.id, host: label, kind: "SUBDOMAIN", status: "ACTIVE" } })
      return site
    })
  } catch (err) {
    // Two first visits at once: the unique key let one create the site; the other reads it.
    if ((err as { code?: string })?.code === "P2002") return prisma.organisationSite.findUniqueOrThrow({ where: { organisationId } })
    throw err
  }
}

export interface EditorState {
  site: {
    id: string
    status: string
    version: number
    hasUnpublishedChanges: boolean
    approved: boolean
    publishedAt: string | null
    submittedAt: string | null
    rejectionReason: string | null
    disabled: boolean
    disabledReason: string | null
    logo: string | null
  }
  /** The address the site answers on, if one has been chosen; `url` is null until a root domain is configured. */
  address: { label: string | null; url: string | null; previous: string[] }
  theme: SiteTheme
  content: SiteContent
  locations: { id: string; name: string; city: string; status: string; slug: string }[]
  /** What stops it going live right now (empty when nothing does). */
  problems: string[]
  revisions: { id: string; version: number; createdAt: string; note: string | null }[]
  websiteDomainConfigured: boolean
  /** Basic or advanced ("Website Pro"): what this business may use, and what to tell it about upgrading. */
  tier: SiteTier
}

/** What is wrong with the site's readiness: missing address, missing text, no live location, switched off. */
async function readiness(site: OrganisationSite, organisationId: string, content: SiteContent, activeLabel: string | null): Promise<string[]> {
  const problems: string[] = []
  if (site.disabledAt) problems.push("Quote My Garage has switched this website off. Contact support.")
  if (!activeLabel) problems.push("Choose your website address.")
  const missing = publishProblems(content)
  if (missing.length > 0) problems.push(`Add ${missing.join(", ")}.`)
  const live = await prisma.garage.count({ where: { organisationId, status: "APPROVED" } })
  if (live === 0) problems.push("At least one of your locations must be approved and live before the website can go live.")
  return problems
}

export async function getEditorState(ctx: Ctx): Promise<EditorState> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  const [domains, locations, revisions] = await Promise.all([
    prisma.siteDomain.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "asc" } }),
    prisma.garage.findMany({ where: { organisationId: org.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, city: true, status: true, slug: true } }),
    prisma.siteRevision.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" }, take: MAX_REVISIONS, select: { id: true, version: true, createdAt: true, note: true } }),
  ])
  const active = domains.find((d) => d.status === "ACTIVE") ?? null
  const content = parseContent(site.draftContent ?? site.content, org.name)
  const theme = parseTheme(site.draftTheme ?? site.theme)

  return {
    site: {
      id: site.id,
      status: site.status,
      version: site.version,
      hasUnpublishedChanges: site.draftContent !== null || site.draftTheme !== null,
      approved: site.approvedAt !== null,
      publishedAt: site.publishedAt?.toISOString() ?? null,
      submittedAt: site.submittedAt?.toISOString() ?? null,
      rejectionReason: site.status === "REJECTED" ? site.rejectionReason : null,
      disabled: site.disabledAt !== null,
      disabledReason: site.disabledAt ? site.disabledReason : null,
      logo: site.logo,
    },
    address: { label: active?.host ?? null, url: active ? siteAddress(active.host) : null, previous: domains.filter((d) => d.status === "REDIRECT").map((d) => d.host) },
    theme,
    content,
    locations,
    problems: await readiness(site, org.id, content, active?.host ?? null),
    revisions: revisions.map((r) => ({ id: r.id, version: r.version, createdAt: r.createdAt.toISOString(), note: r.note })),
    websiteDomainConfigured: Boolean(rootDomain()),
    tier: siteTier(org),
  }
}

// ---- editing --------------------------------------------------------------------------------------------------------

/** Saves edits to the draft. The live site doesn't change until it is published. */
export async function saveDraft(ctx: Ctx, input: SaveDraftInput): Promise<{ version: number }> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)

  // A business without the advanced website can't change its advanced settings: what it had saved is kept (and comes back if
  // it upgrades), whatever the request says. Everything else it sends is saved as usual.
  const content = input.content ? mergeSavedContent(input.content, parseContent(site.draftContent ?? site.content, org.name), siteTier(org)) : undefined
  if (content) {
    const problems = contentProblems(content, org.id)
    if (problems.length > 0) throw new OrgError("INVALID_INPUT", problems[0], { problems })
  }
  if (input.logo && !isOwnOrgImageUrl(input.logo, org.id)) throw new OrgError("INVALID_INPUT", "The logo must be uploaded here; you can't link to another website's image.")

  const data: Prisma.OrganisationSiteUpdateManyMutationInput = { version: { increment: 1 } }
  if (content) data.draftContent = JSON.stringify(content)
  if (input.theme) data.draftTheme = JSON.stringify(input.theme)
  if (input.logo !== undefined) data.logo = input.logo

  // The version in the WHERE is the whole protection: if another editor saved since this one loaded, nothing matches.
  const updated = await prisma.organisationSite.updateMany({ where: { id: site.id, version: input.expectedVersion }, data })
  if (updated.count === 0) throw new OrgError("STALE", "Someone else changed the website since you opened it. Reload to see their changes, then make your edit again.")
  return { version: input.expectedVersion + 1 }
}

/** Records a logo upload against the site (the file is already stored under orgs/<id>/). Returns the site's new version. */
export async function setLogo(ctx: Ctx, url: string | null): Promise<{ version: number }> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  if (url && !isOwnOrgImageUrl(url, org.id)) throw new OrgError("INVALID_INPUT", "The logo must be uploaded here.")
  const updated = await prisma.organisationSite.update({ where: { id: site.id }, data: { logo: url, version: { increment: 1 } }, select: { version: true } })
  return { version: updated.version }
}

/**
 * Chooses the website address. Changing it keeps the old address redirecting to the new one forever (links, search results
 * and printed material keep working, and nobody else can take it). Going back to an earlier address is allowed.
 */
export async function setAddress(ctx: Ctx, input: string): Promise<{ label: string; url: string | null }> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  const parsed = parseLabel(input)
  if (!parsed.ok) throw new OrgError("INVALID_INPUT", parsed.error)
  const label = parsed.label

  const result = await prisma.$transaction(async (tx) => {
    const domains = await tx.siteDomain.findMany({ where: { siteId: site.id } })
    const active = domains.find((d) => d.status === "ACTIVE")
    if (active?.host === label) return { changed: false, from: active.host }

    const mine = domains.find((d) => d.host === label)
    if (!mine && domains.length >= MAX_LABELS_PER_SITE) {
      throw new OrgError("LIMIT", `A website can have used at most ${MAX_LABELS_PER_SITE} addresses. Keep using one of your earlier ones.`, { limit: MAX_LABELS_PER_SITE })
    }
    if (!mine) {
      const taken = await tx.siteDomain.findUnique({ where: { host: label }, select: { id: true } })
      if (taken) throw new OrgError("CONFLICT", "That address is already taken. Please choose another.")
    }
    if (active) await tx.siteDomain.update({ where: { id: active.id }, data: { status: "REDIRECT" } })
    if (mine) await tx.siteDomain.update({ where: { id: mine.id }, data: { status: "ACTIVE" } })
    else await tx.siteDomain.create({ data: { siteId: site.id, host: label, kind: "SUBDOMAIN", status: "ACTIVE" } })
    return { changed: true, from: active?.host ?? null }
  }).catch((err) => {
    // Two businesses claiming the same label at once: the unique key lets one win.
    if ((err as { code?: string })?.code === "P2002") throw new OrgError("CONFLICT", "That address is already taken. Please choose another.")
    throw err
  })

  if (result.changed) {
    await audit({ user: ctx.actor }, { action: "SITE_ADDRESS_CHANGED", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: `${result.from ?? "(none)"} -> ${label}` })
    await invalidateSite(org.id)
  }
  return { label, url: siteAddress(label) }
}

/** Is this label usable by this business right now? For the "checking..." hint beside the address field. */
export async function checkAddress(ctx: Ctx, input: string): Promise<{ ok: boolean; label: string; message: string | null }> {
  const org = business(ctx)
  const parsed = parseLabel(input)
  if (!parsed.ok) return { ok: false, label: input.trim().toLowerCase(), message: parsed.error }
  const domain = await prisma.siteDomain.findUnique({ where: { host: parsed.label }, include: { site: { select: { organisationId: true } } } })
  if (domain && domain.site.organisationId !== org.id) return { ok: false, label: parsed.label, message: "That address is already taken." }
  return { ok: true, label: parsed.label, message: null }
}

// ---- publishing -----------------------------------------------------------------------------------------------------

/** Makes the draft the live site, in one transaction, and keeps a copy so it can be rolled back to. */
async function publishDraft(tx: Prisma.TransactionClient, site: OrganisationSite, businessName: string, createdById: string | null, note: string | null): Promise<void> {
  const content = JSON.stringify(parseContent(site.draftContent ?? site.content, businessName))
  const theme = JSON.stringify(parseTheme(site.draftTheme ?? site.theme))
  const version = site.version + 1
  await tx.organisationSite.update({
    where: { id: site.id },
    data: { content, theme, draftContent: null, draftTheme: null, status: "PUBLISHED", publishedAt: new Date(), version, rejectedAt: null, rejectionReason: null },
  })
  await tx.siteRevision.create({ data: { siteId: site.id, version, content, theme, createdById, note } })
  const old = await tx.siteRevision.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } })
  if (old.length > 0) await tx.siteRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } })
}

async function assertCanGoLive(site: OrganisationSite, organisationId: string, businessName: string): Promise<void> {
  const content = parseContent(site.draftContent ?? site.content, businessName)
  const active = await prisma.siteDomain.findFirst({ where: { siteId: site.id, status: "ACTIVE" }, select: { host: true } })
  const problems = await readiness(site, organisationId, content, active?.host ?? null)
  if (problems.length > 0) throw new OrgError("NOT_READY", problems[0], { problems })
}

/**
 * The owner asks to go live. The first time, that sends the site to a platform admin; once a site has been approved,
 * later publishes go live straight away.
 */
export async function requestPublish(ctx: Ctx): Promise<{ status: "PENDING_REVIEW" | "PUBLISHED" }> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  await assertCanGoLive(site, org.id, org.name)

  if (site.approvedAt) {
    await prisma.$transaction((tx) => publishDraft(tx, site, org.name, ctx.actor.id, null))
    await audit({ user: ctx.actor }, { action: "SITE_PUBLISHED", targetType: "SITE", targetId: site.id, organisationId: org.id })
    await invalidateSite(org.id)
    return { status: "PUBLISHED" }
  }

  if (site.status === "PENDING_REVIEW") return { status: "PENDING_REVIEW" } // already waiting
  await prisma.organisationSite.update({ where: { id: site.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date(), rejectedAt: null, rejectionReason: null } })
  await audit({ user: ctx.actor }, { action: "SITE_SUBMITTED", targetType: "SITE", targetId: site.id, organisationId: org.id })
  return { status: "PENDING_REVIEW" }
}

/** Takes the website offline. It keeps its approval, so publishing again is immediate. */
export async function unpublish(ctx: Ctx): Promise<void> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  if (site.status !== "PUBLISHED") throw new OrgError("CONFLICT", "The website isn't published.")
  await prisma.organisationSite.update({ where: { id: site.id }, data: { status: "UNPUBLISHED", version: { increment: 1 } } })
  await audit({ user: ctx.actor }, { action: "SITE_UNPUBLISHED", targetType: "SITE", targetId: site.id, organisationId: org.id })
  await invalidateSite(org.id)
}

/** Withdraws a submission that is still waiting for review, back to a draft. */
export async function withdrawSubmission(ctx: Ctx): Promise<void> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  if (site.status !== "PENDING_REVIEW") throw new OrgError("CONFLICT", "The website isn't waiting for review.")
  await prisma.organisationSite.update({ where: { id: site.id }, data: { status: "DRAFT", submittedAt: null } })
}

/** Puts an earlier published version back live. Unpublished edits in the draft are left alone. */
export async function rollback(ctx: Ctx, revisionId: string): Promise<void> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  if (site.status !== "PUBLISHED") throw new OrgError("CONFLICT", "Only a published website can be rolled back.")
  if (site.disabledAt) throw new OrgError("CONFLICT", "Quote My Garage has switched this website off.")
  const revision = await prisma.siteRevision.findFirst({ where: { id: revisionId, siteId: site.id } }) // this site's own history only
  if (!revision) throw new OrgError("NOT_FOUND", "That version isn't available any more.")

  const version = site.version + 1
  await prisma.$transaction(async (tx) => {
    await tx.organisationSite.update({ where: { id: site.id }, data: { content: revision.content, theme: revision.theme, publishedAt: new Date(), version } })
    await tx.siteRevision.create({ data: { siteId: site.id, version, content: revision.content, theme: revision.theme, createdById: ctx.actor.id, note: `Rolled back to version ${revision.version}` } })
    const old = await tx.siteRevision.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } })
    if (old.length > 0) await tx.siteRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } })
  })
  await audit({ user: ctx.actor }, { action: "SITE_ROLLED_BACK", targetType: "SITE", targetId: site.id, organisationId: org.id, detail: `to version ${revision.version}` })
  await invalidateSite(org.id)
}

/** The draft as it would be published, for the preview page. Same shape the public page renders. */
export async function previewParts(ctx: Ctx): Promise<{ theme: SiteTheme; content: SiteContent; logo: string | null; siteId: string }> {
  const org = business(ctx)
  const site = await ensureSite(org.id, org.name)
  // What a visitor would see: a business without the advanced website previews the basic design.
  const content = contentForTier(parseContent(site.draftContent ?? site.content, org.name), siteTier(org))
  return { theme: parseTheme(site.draftTheme ?? site.theme), content, logo: site.logo, siteId: site.id }
}

// Used by the admin module (site-admin.ts) so both go live the same way.
export const publishForAdmin = publishDraft
export { readiness as siteReadiness }
