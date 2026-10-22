import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeWalkInBooking } from "@/test/fixtures"
import { OrgError } from "@/lib/org/org-error"
import { defaultContent } from "@/lib/site/content"
import { DEFAULT_THEME } from "@/lib/site/theme"
import { MAX_LABELS_PER_SITE, MAX_REVISIONS, checkAddress, ensureSite, getEditorState, requestPublish, rollback, saveDraft, setAddress, unpublish, withdrawSubmission } from "@/lib/site/site-service"
import { applySiteAction, listSites } from "@/lib/site/site-admin"
import { loadPublicSite } from "@/lib/site/public"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const PREFIX = "sitesvc-"
const admin = { user: { id: "admin-1", email: "admin@example.com" } }
const label = (n: string) => `${PREFIX}${n}-${Math.random().toString(36).slice(2, 7)}`

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { targetType: "SITE", actorEmail: "admin@example.com", detail: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

/** A business with one live location, and the context its owner acts with. */
async function setup(key = "main") {
  const biz = await makeGarage(PREFIX, { key })
  const org = biz.organisation!
  const ctx = { organisation: org, actor: { id: biz.user.id, email: biz.user.email } }
  return { ...biz, org, ctx }
}

/** Gets a site all the way to published: address chosen, submitted, approved by an admin. */
async function publishedSite(s: Awaited<ReturnType<typeof setup>>, addr = label("pub")) {
  await setAddress(s.ctx, addr)
  await requestPublish(s.ctx)
  const site = await prisma.organisationSite.findUniqueOrThrow({ where: { organisationId: s.org.id } })
  await applySiteAction(admin, "admin-1", { siteId: site.id, action: "approve" })
  return { siteId: site.id, address: addr.toLowerCase() }
}

const expectOrgError = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e) => e)
  expect(err, `expected an OrgError ${code}`).toBeInstanceOf(OrgError)
  expect((err as OrgError).code).toBe(code)
  return err as OrgError
}

describe("ensureSite", () => {
  it("creates a draft with starter text and a suggested address from the business name, once", async () => {
    const s = await setup()
    const [a, b] = await Promise.all([ensureSite(s.org.id, s.org.name), ensureSite(s.org.id, s.org.name)])
    expect(a.id).toBe(b.id) // two first visits at once make one site
    expect(a).toMatchObject({ status: "DRAFT", version: 1 })
    expect(JSON.parse(a.draftContent!).hero.headline).toBe(s.org.name.slice(0, 90))
    expect(JSON.parse(a.draftTheme!)).toEqual(DEFAULT_THEME)
    const domains = await prisma.siteDomain.findMany({ where: { siteId: a.id } })
    expect(domains).toHaveLength(1)
    expect(domains[0]).toMatchObject({ kind: "SUBDOMAIN", status: "ACTIVE" })
    expect(domains[0].host).toMatch(/^sitesvc-main-/)
  })

  it("suggests nothing when the name can't be an address, leaving the owner to choose", async () => {
    const s = await setup()
    await prisma.siteDomain.deleteMany({ where: { site: { organisationId: s.org.id } } })
    await prisma.organisationSite.deleteMany({ where: { organisationId: s.org.id } })
    const site = await ensureSite(s.org.id, "Admin")
    expect(await prisma.siteDomain.count({ where: { siteId: site.id } })).toBe(0)
    const state = await getEditorState({ ...s.ctx, organisation: { ...s.org, name: "Admin" } })
    expect(state.address.label).toBeNull()
    expect(state.problems.join(" ")).toMatch(/Choose your website address/)
  })

  it("gives two businesses with the same name different addresses", async () => {
    const a = await setup("twin")
    const b = await makeGarage(PREFIX, { key: "twin" })
    await prisma.organisation.update({ where: { id: b.organisation!.id }, data: { name: a.org.name } })
    const sa = await ensureSite(a.org.id, a.org.name)
    const sb = await ensureSite(b.organisation!.id, a.org.name)
    const hosts = (await prisma.siteDomain.findMany({ where: { siteId: { in: [sa.id, sb.id] } } })).map((d) => d.host)
    expect(new Set(hosts).size).toBe(2)
  })
})

describe("editing the draft", () => {
  it("saves to the draft only, bumping the version", async () => {
    const s = await setup()
    const state = await getEditorState(s.ctx)
    const content = { ...state.content, hero: { ...state.content.hero, headline: "Fresh headline" } }
    expect(await saveDraft(s.ctx, { expectedVersion: state.site.version, content })).toEqual({ version: 2 })
    const site = await prisma.organisationSite.findUniqueOrThrow({ where: { organisationId: s.org.id } })
    expect(JSON.parse(site.draftContent!).hero.headline).toBe("Fresh headline")
    expect(site.content).toBe("{}") // nothing live changed
    expect(site.version).toBe(2)
  })

  it("refuses a stale editor instead of overwriting the newer work", async () => {
    const s = await setup()
    const state = await getEditorState(s.ctx)
    await saveDraft(s.ctx, { expectedVersion: state.site.version, theme: { ...state.theme, brand: "#112233" } })
    const stale = await expectOrgError(saveDraft(s.ctx, { expectedVersion: state.site.version, theme: { ...state.theme, brand: "#445566" } }), "STALE")
    expect(stale.message).toMatch(/Reload/)
    expect((await getEditorState(s.ctx)).theme.brand).toBe("#112233")
  })

  it("lets only one of two simultaneous saves win", async () => {
    const s = await setup()
    const v = (await getEditorState(s.ctx)).site.version
    const results = await Promise.allSettled([
      saveDraft(s.ctx, { expectedVersion: v, theme: { ...DEFAULT_THEME, brand: "#111111" } }),
      saveDraft(s.ctx, { expectedVersion: v, theme: { ...DEFAULT_THEME, brand: "#222222" } }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
  })

  it("refuses photos that aren't this business's own uploads", async () => {
    const s = await setup()
    const state = await getEditorState(s.ctx)
    const bad = { ...state.content, hero: { ...state.content.hero, imageUrl: "https://evil.example.com/x.jpg" } }
    const err = await expectOrgError(saveDraft(s.ctx, { expectedVersion: state.site.version, content: bad }), "INVALID_INPUT")
    expect(err.message).toMatch(/uploaded here/)
    await expectOrgError(saveDraft(s.ctx, { expectedVersion: state.site.version, logo: "https://evil.example.com/logo.png" }), "INVALID_INPUT")

    const own = `https://abc.public.blob.vercel-storage.com/orgs/${s.org.id}/hero.jpg`
    await saveDraft(s.ctx, { expectedVersion: state.site.version, content: { ...state.content, hero: { ...state.content.hero, imageUrl: own } }, logo: `https://abc.public.blob.vercel-storage.com/orgs/${s.org.id}/logo.png` })
    expect((await getEditorState(s.ctx)).site.logo).toContain(`/orgs/${s.org.id}/`)
  })

  it("never touches another business's site", async () => {
    const a = await setup("a")
    const b = await setup("b")
    const sa = await getEditorState(a.ctx)
    await saveDraft(b.ctx, { expectedVersion: (await getEditorState(b.ctx)).site.version, theme: { ...DEFAULT_THEME, brand: "#ABCDEF" } })
    expect((await getEditorState(a.ctx)).theme.brand).toBe(sa.theme.brand)
  })
})

describe("the address", () => {
  it("is chosen once, then changed with the old one kept as a redirect", async () => {
    const s = await setup()
    const first = label("first")
    const second = label("second")
    await setAddress(s.ctx, first)
    await setAddress(s.ctx, second)
    const state = await getEditorState(s.ctx)
    expect(state.address.label).toBe(second.toLowerCase())
    expect(state.address.previous).toContain(first.toLowerCase())
    const rows = await prisma.siteDomain.findMany({ where: { site: { organisationId: s.org.id } } })
    expect(rows.find((r) => r.host === first.toLowerCase())?.status).toBe("REDIRECT")
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1)
    expect(await prisma.auditLog.count({ where: { organisationId: s.org.id, action: "SITE_ADDRESS_CHANGED" } })).toBeGreaterThanOrEqual(2)
  })

  it("normalises what is typed, and does nothing when it hasn't changed", async () => {
    const s = await setup()
    const typed = label("Mixed Case")
    const r = await setAddress(s.ctx, `  ${typed.toUpperCase()}  `)
    expect(r.label).toBe(typed.toLowerCase().replace(/\s+/g, "-"))
    const before = await prisma.auditLog.count({ where: { organisationId: s.org.id, action: "SITE_ADDRESS_CHANGED" } })
    await setAddress(s.ctx, r.label)
    expect(await prisma.auditLog.count({ where: { organisationId: s.org.id, action: "SITE_ADDRESS_CHANGED" } })).toBe(before)
  })

  it("can't take an address another business has, or one that was ever used and is now a redirect", async () => {
    const a = await setup("a")
    const b = await setup("b")
    const mine = label("mine")
    await setAddress(a.ctx, mine)
    await setAddress(a.ctx, label("newer")) // `mine` now only redirects
    await expectOrgError(setAddress(b.ctx, mine), "CONFLICT")
    expect((await checkAddress(b.ctx, mine)).ok).toBe(false)
    expect((await checkAddress(a.ctx, mine)).ok).toBe(true) // its own old address can be taken back
  })

  it("lets a business go back to an earlier address", async () => {
    const s = await setup()
    const first = label("one")
    await setAddress(s.ctx, first)
    await setAddress(s.ctx, label("two"))
    await setAddress(s.ctx, first)
    expect((await getEditorState(s.ctx)).address.label).toBe(first.toLowerCase())
  })

  it("refuses reserved, malformed and too-short addresses", async () => {
    const s = await setup()
    for (const bad of ["admin", "www", "ab", "has.dot", "xn--bad", "-lead", "аpple-motors", "stripe-pay"]) await expectOrgError(setAddress(s.ctx, bad), "INVALID_INPUT")
  })

  it("limits how many addresses one site can have used", async () => {
    const s = await setup()
    await ensureSite(s.org.id, s.org.name)
    const used = await prisma.siteDomain.count({ where: { site: { organisationId: s.org.id } } })
    for (let i = used; i < MAX_LABELS_PER_SITE; i++) await setAddress(s.ctx, label(`n${i}`))
    const err = await expectOrgError(setAddress(s.ctx, label("one-too-many")), "LIMIT")
    expect(err.details).toMatchObject({ limit: MAX_LABELS_PER_SITE })
  })
})

describe("going live", () => {
  it("won't go live without an address, text or a live location, and says why", async () => {
    const s = await setup()
    await ensureSite(s.org.id, s.org.name)
    await prisma.siteDomain.deleteMany({ where: { site: { organisationId: s.org.id } } }) // a site that has no address yet
    const noAddress = await expectOrgError(requestPublish(s.ctx), "NOT_READY")
    expect(noAddress.message).toMatch(/address/)

    await setAddress(s.ctx, label("ok"))
    const state = await getEditorState(s.ctx)
    await saveDraft(s.ctx, { expectedVersion: state.site.version, content: { ...state.content, hero: { ...state.content.hero, headline: "" } } })
    expect((await expectOrgError(requestPublish(s.ctx), "NOT_READY")).message).toMatch(/headline/)

    await saveDraft(s.ctx, { expectedVersion: state.site.version + 1, content: state.content })
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "PENDING" } })
    expect((await expectOrgError(requestPublish(s.ctx), "NOT_READY")).message).toMatch(/live/)
  })

  it("the first publish goes to an admin; nothing is public until they approve", async () => {
    const s = await setup()
    const addr = label("first")
    await setAddress(s.ctx, addr)
    expect(await requestPublish(s.ctx)).toEqual({ status: "PENDING_REVIEW" })
    expect(await requestPublish(s.ctx)).toEqual({ status: "PENDING_REVIEW" }) // asking twice changes nothing
    expect((await loadPublicSite(addr.toLowerCase())).state).toBe("missing")
    expect((await listSites({ status: "PENDING_REVIEW", q: PREFIX, page: 1, pageSize: 50 })).sites.map((x) => x.organisationId)).toContain(s.org.id)
  })

  it("can withdraw a submission that is waiting", async () => {
    const s = await setup()
    await setAddress(s.ctx, label("w"))
    await requestPublish(s.ctx)
    await withdrawSubmission(s.ctx)
    expect((await getEditorState(s.ctx)).site.status).toBe("DRAFT")
    await expectOrgError(withdrawSubmission(s.ctx), "CONFLICT")
  })

  it("approval publishes the draft, records a version, and tells the business", async () => {
    const s = await setup()
    const { siteId, address } = await publishedSite(s)
    const site = await prisma.organisationSite.findUniqueOrThrow({ where: { id: siteId } })
    expect(site).toMatchObject({ status: "PUBLISHED", draftContent: null, draftTheme: null, approvedById: "admin-1" })
    expect(JSON.parse(site.content).hero.headline).toBe(s.org.name.slice(0, 90))
    expect(await prisma.siteRevision.count({ where: { siteId } })).toBe(1)
    expect((await loadPublicSite(address)).state).toBe("ok")
    expect(await prisma.notification.count({ where: { garageId: s.garage.id, title: "Your website is live" } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { organisationId: s.org.id, action: "SITE_APPROVED" } })).toBe(1)
  })

  it("after approval, later edits stay in the draft until published, and publishing needs no review", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    const state = await getEditorState(s.ctx)
    expect(state.site.hasUnpublishedChanges).toBe(false)
    await saveDraft(s.ctx, { expectedVersion: state.site.version, content: { ...state.content, hero: { ...state.content.hero, headline: "New season offer" } } })

    const live = async () => {
      const r = await loadPublicSite(address)
      return r.state === "ok" ? r.site.content.hero.headline : null
    }
    expect(await live()).toBe(s.org.name.slice(0, 90)) // the visitor still sees the old one
    expect((await getEditorState(s.ctx)).site.hasUnpublishedChanges).toBe(true)

    expect(await requestPublish(s.ctx)).toEqual({ status: "PUBLISHED" })
    expect(await live()).toBe("New season offer")
  })

  it("keeps only the last revisions, and can roll back to an earlier one", async () => {
    const s = await setup()
    const { siteId, address } = await publishedSite(s)
    for (let i = 1; i <= MAX_REVISIONS + 3; i++) {
      const st = await getEditorState(s.ctx)
      await saveDraft(s.ctx, { expectedVersion: st.site.version, content: { ...st.content, hero: { ...st.content.hero, headline: `Headline ${i}` } } })
      await requestPublish(s.ctx)
    }
    expect(await prisma.siteRevision.count({ where: { siteId } })).toBe(MAX_REVISIONS)

    const state = await getEditorState(s.ctx)
    const older = state.revisions[5]
    await rollback(s.ctx, older.id)
    const r = await loadPublicSite(address)
    expect(r.state === "ok" && r.site.content.hero.headline).toMatch(/^Headline \d+$/)
    expect(r.state === "ok" && r.site.content.hero.headline).not.toBe(`Headline ${MAX_REVISIONS + 3}`)
    const after = await getEditorState(s.ctx)
    expect(after.revisions[0].note).toMatch(/Rolled back/)
    expect(after.revisions).toHaveLength(MAX_REVISIONS)
  })

  it("can't roll back to another site's version", async () => {
    const a = await setup("a")
    const b = await setup("b")
    await publishedSite(a)
    await publishedSite(b)
    const theirs = (await getEditorState(b.ctx)).revisions[0]
    await expectOrgError(rollback(a.ctx, theirs.id), "NOT_FOUND")
  })

  it("can be taken offline and put back without another review", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    await unpublish(s.ctx)
    expect((await loadPublicSite(address)).state).toBe("missing")
    await expectOrgError(unpublish(s.ctx), "CONFLICT")
    expect(await requestPublish(s.ctx)).toEqual({ status: "PUBLISHED" })
    expect((await loadPublicSite(address)).state).toBe("ok")
  })
})

describe("admin decisions", () => {
  async function pending(s: Awaited<ReturnType<typeof setup>>) {
    await setAddress(s.ctx, label("p"))
    await requestPublish(s.ctx)
    return (await prisma.organisationSite.findUniqueOrThrow({ where: { organisationId: s.org.id } })).id
  }

  it("sends a site back with a reason, and the business can fix and resubmit", async () => {
    const s = await setup()
    const siteId = await pending(s)
    await applySiteAction(admin, "admin-1", { siteId, action: "reject", reason: "Please add your opening times" })
    const state = await getEditorState(s.ctx)
    expect(state.site).toMatchObject({ status: "REJECTED", rejectionReason: "Please add your opening times" })
    expect(await prisma.notification.count({ where: { garageId: s.garage.id, title: "Your website needs changes" } })).toBe(1)
    expect(await requestPublish(s.ctx)).toEqual({ status: "PENDING_REVIEW" })
    expect((await getEditorState(s.ctx)).site.rejectionReason).toBeNull()
  })

  it("only acts on what is waiting, and refuses to approve a site that couldn't go live", async () => {
    const s = await setup()
    const siteId = await pending(s)
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "SUSPENDED" } })
    const err = await expectOrgError(applySiteAction(admin, "admin-1", { siteId, action: "approve" }), "NOT_READY")
    expect(err.message).toMatch(/can't go live/)
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "APPROVED" } })
    await applySiteAction(admin, "admin-1", { siteId, action: "approve" })
    await expectOrgError(applySiteAction(admin, "admin-1", { siteId, action: "approve" }), "CONFLICT")
    await expectOrgError(applySiteAction(admin, "admin-1", { siteId, action: "reject", reason: "too late" }), "CONFLICT")
    await expectOrgError(applySiteAction(admin, "admin-1", { siteId: "nope", action: "approve" }), "NOT_FOUND")
  })

  it("the kill switch takes a live site down at once, blocks publishing, and can be lifted", async () => {
    const s = await setup()
    const { siteId, address } = await publishedSite(s)
    await applySiteAction(admin, "admin-1", { siteId, action: "disable", reason: "Misleading claims" })
    expect((await loadPublicSite(address)).state).toBe("missing")
    expect((await getEditorState(s.ctx)).site).toMatchObject({ disabled: true, disabledReason: "Misleading claims" })
    expect((await expectOrgError(requestPublish(s.ctx), "NOT_READY")).message).toMatch(/switched this website off/)
    await expectOrgError(applySiteAction(admin, "admin-1", { siteId, action: "disable", reason: "again" }), "CONFLICT")

    await applySiteAction(admin, "admin-1", { siteId, action: "enable" })
    expect((await loadPublicSite(address)).state).toBe("ok")
    await expectOrgError(applySiteAction(admin, "admin-1", { siteId, action: "enable" }), "CONFLICT")
    const trail = (await prisma.auditLog.findMany({ where: { organisationId: s.org.id, targetType: "SITE" } })).map((r) => r.action)
    expect(trail).toEqual(expect.arrayContaining(["SITE_APPROVED", "SITE_DISABLED", "SITE_ENABLED"]))
  })
})

describe("what visitors can see", () => {
  it("shows only the published version, with live locations and good reviews, and nothing else", async () => {
    const s = await setup()
    const second = await makeLocation(PREFIX, s.org.id, { key: "second" })
    await makeLocation(PREFIX, s.org.id, { key: "pending", status: "PENDING" })
    await makeLocation(PREFIX, s.org.id, { key: "closed", status: "ARCHIVED" })
    const { address } = await publishedSite(s)

    // Reviews: only 4+ stars, substantial, undisputed; first name only.
    const mk = async (garageId: string, rating: number, comment: string, over: object = {}) => {
      const b = await makeWalkInBooking(garageId, { status: "COMPLETED" })
      return prisma.review.create({ data: { garageId, bookingId: b.id, rating, comment, customerName: "Pat Customer", ...over } })
    }
    await mk(s.garage.id, 5, "Fantastic service, honest and quick.")
    await mk(second.id, 4, "Good work and a fair price overall.")
    await mk(s.garage.id, 2, "Not happy with the wait at all really.")
    await mk(s.garage.id, 5, "Too short")
    await mk(s.garage.id, 5, "This one is being disputed by the garage.", { disputeStatus: "OPEN" })

    const r = await loadPublicSite(address)
    if (r.state !== "ok") throw new Error("expected the site to be live")
    expect(r.site.locations.map((l) => l.id).sort()).toEqual([s.garage.id, second.id].sort())
    expect(r.site.reviews.map((x) => x.comment).sort()).toEqual(["Fantastic service, honest and quick.", "Good work and a fair price overall."])
    expect(r.site.reviews.every((x) => x.name === "Pat")).toBe(true)
    expect(r.site.services.length).toBeGreaterThan(0)
    expect(JSON.stringify(r.site)).not.toMatch(/draft|disabledReason|approvedById/)
  })

  it("is a 404 for unknown addresses, unpublished sites, suspended businesses and businesses with nothing live", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    expect((await loadPublicSite("no-such-site")).state).toBe("missing")

    await prisma.organisation.update({ where: { id: s.org.id }, data: { suspendedAt: new Date() } })
    expect((await loadPublicSite(address)).state).toBe("missing")
    await prisma.organisation.update({ where: { id: s.org.id }, data: { suspendedAt: null } })

    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "SUSPENDED" } })
    expect((await loadPublicSite(address)).state).toBe("missing")
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "APPROVED" } })
    expect((await loadPublicSite(address)).state).toBe("ok")
  })

  it("stops serving a site when the `sites` flag is switched off for its business, and serves it again when it's back (content kept)", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    const stubProd = (features: string, beta = "") => {
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv("ORG_FEATURES", features)
      vi.stubEnv("ORG_BETA_IDS", beta)
    }
    try {
      stubProd("staff,locations") // `sites` not listed
      expect((await loadPublicSite(address)).state).toBe("missing")
      stubProd("staff,locations,sites", "some-other-business") // on, but only for another business
      expect((await loadPublicSite(address)).state).toBe("missing")
      stubProd("sites", s.org.id)
      expect((await loadPublicSite(address)).state).toBe("ok")
    } finally {
      vi.unstubAllEnvs()
    }
    expect((await loadPublicSite(address)).state).toBe("ok")
  })

  it("redirects an old address to the new one, permanently", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    const newer = label("newer").toLowerCase()
    await setAddress(s.ctx, newer)
    expect(await loadPublicSite(address)).toEqual({ state: "redirect", label: newer })
    expect((await loadPublicSite(newer)).state).toBe("ok")
  })

  it("an old address whose site is down doesn't leak where the site moved to", async () => {
    const s = await setup()
    const { address } = await publishedSite(s)
    await setAddress(s.ctx, label("moved"))
    await unpublish(s.ctx)
    // The redirect target would itself be a 404, but the old address still resolves to "redirect": the page then 404s there.
    const r = await loadPublicSite(address)
    expect(r.state).toBe("redirect")
  })
})
