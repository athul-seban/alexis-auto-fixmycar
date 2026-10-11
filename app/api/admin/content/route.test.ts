import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PUT } from "./route"
import { cleanupPrefix, makeOwner } from "@/test/fixtures"
import { getMessages } from "@/lib/i18n/server"
import { getLegalPage, liveLegalPages } from "@/lib/legal"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
// Outside a Next request there is no data cache: run the cached function directly and treat revalidation as a no-op.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "contenttest-"
const KEYS = ["hero.title1", "legal.privacy.body", "legal.privacy.title", "site.notice", "footer.email", "email.review.subject"]

const put = (body: object) => PUT(new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const list = async (locale: string) => (await GET(new Request(`http://x/api/admin/content?locale=${locale}`))).json()

async function asAdmin() {
  const { user } = await makeOwner(PREFIX)
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
  mockSession.mockResolvedValue({ user: { id: user.id, role: "ADMIN" } } as any)
  return user
}

const wipe = () => prisma.contentEntry.deleteMany({ where: { key: { in: KEYS } } })
beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
  await wipe()
})
afterAll(async () => {
  await cleanupPrefix(PREFIX)
  await wipe()
})

describe("/api/admin/content", () => {
  it("is admin-only", async () => {
    mockSession.mockResolvedValue(null)
    expect((await GET(new Request("http://x/api/admin/content"))).status).toBe(401)
    expect((await put({ key: "hero.title1", locale: "en", action: "publish", text: "x" })).status).toBe(401)
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await put({ key: "hero.title1", locale: "en", action: "publish", text: "x" })).status).toBe(401)
  })

  it("lists every key with the built-in text for the chosen language", async () => {
    await asAdmin()
    const fr = await list("fr")
    const hero = fr.entries.find((e: any) => e.key === "hero.title1")
    expect(hero).toMatchObject({ default: "Trouvez des", english: "Find Trusted", value: "", draft: null })
    expect(fr.entries.find((e: any) => e.key === "legal.privacy.body")).toMatchObject({ isBody: true, multiline: true })
    expect((await GET(new Request("http://x/api/admin/content?locale=xx"))).status).toBe(400)
  })

  it("keeps a draft out of the live site until it is published, then reset restores the built-in text", async () => {
    await asAdmin()
    expect((await put({ key: "hero.title1", locale: "de", action: "saveDraft", text: "Entwurf" })).status).toBe(200)
    expect((await getMessages("de"))["hero.title1"]).toBe("Finden Sie") // draft is not live

    expect((await put({ key: "hero.title1", locale: "de", action: "publish" })).status).toBe(200) // publishes the saved draft
    expect((await getMessages("de"))["hero.title1"]).toBe("Entwurf")
    expect((await getMessages("fr"))["hero.title1"]).toBe("Trouvez des") // other languages untouched
    expect((await getMessages("en"))["hero.title1"]).toBe("Find Trusted")
    const row = await prisma.contentEntry.findUnique({ where: { key_locale: { key: "hero.title1", locale: "de" } } })
    expect(row).toMatchObject({ value: "Entwurf", draft: null })

    expect((await put({ key: "hero.title1", locale: "de", action: "reset" })).status).toBe(200)
    expect((await getMessages("de"))["hero.title1"]).toBe("Finden Sie")
  })

  it("can discard a draft and records published changes in the audit log", async () => {
    const admin = await asAdmin()
    await put({ key: "site.notice", locale: "en", action: "saveDraft", text: "Maintenance tonight" })
    expect((await list("en")).entries.find((e: any) => e.key === "site.notice").draft).toBe("Maintenance tonight")
    await put({ key: "site.notice", locale: "en", action: "discardDraft" })
    expect((await list("en")).entries.find((e: any) => e.key === "site.notice").draft).toBeNull()

    await put({ key: "site.notice", locale: "en", action: "publish", text: "Open as usual" })
    expect((await getMessages("en"))["site.notice"]).toBe("Open as usual")
    const log = await prisma.auditLog.findFirst({ where: { targetType: "CONTENT", targetId: "en:site.notice" }, orderBy: { createdAt: "desc" } })
    expect(log?.action).toBe("CONTENT_PUBLISHED")
    expect(log?.actorId).toBe(admin.id)
    await prisma.auditLog.deleteMany({ where: { targetType: "CONTENT", targetId: { startsWith: "en:" } } })
  })

  it("offers email wording in English only, and the edit shows up in the next garage email", async () => {
    await asAdmin()
    expect((await list("fr")).entries.some((e: any) => e.key.startsWith("email."))).toBe(false)
    expect((await list("en")).entries.some((e: any) => e.key === "email.review.subject")).toBe(true)
    expect((await put({ key: "email.review.subject", locale: "fr", action: "publish", text: "x" })).status).toBe(400)

    await prisma.contentEntry.deleteMany({ where: { key: "email.review.subject" } })
    expect((await put({ key: "email.review.subject", locale: "en", action: "publish", text: "Fresh {rating}★ feedback" })).status).toBe(200)
    const { garageReviewEmail } = await import("@/lib/email-templates")
    const { makeTranslator } = await import("@/lib/i18n/messages")
    const t = makeTranslator(await getMessages("en"))
    expect(garageReviewEmail({ garageName: "G", rating: 4, comment: "ok", ctaHref: "https://x.test", t }).subject).toBe("Fresh 4★ feedback")
    await put({ key: "email.review.subject", locale: "en", action: "reset" })
    await prisma.auditLog.deleteMany({ where: { targetType: "CONTENT", targetId: "en:email.review.subject" } })
  })

  it("rejects unknown keys, bad values and bad languages", async () => {
    await asAdmin()
    expect((await put({ key: "nope.nope", locale: "en", action: "publish", text: "x" })).status).toBe(400)
    expect((await put({ key: "hero.title1", locale: "xx", action: "publish", text: "x" })).status).toBe(400)
    expect((await put({ key: "footer.email", locale: "en", action: "publish", text: "nope" })).status).toBe(400)
    expect((await put({ key: "hero.title1", locale: "en", action: "publish", text: "x".repeat(2001) })).status).toBe(400)
    expect((await put({ nonsense: true })).status).toBe(400)
    expect(await prisma.contentEntry.count({ where: { key: { in: KEYS } } })).toBe(0)
  })
})

describe("legal pages", () => {
  it("do not exist until the business publishes them, fall back to English per language, and list in the footer", async () => {
    await asAdmin()
    expect(await getLegalPage("privacy", "en")).toBeNull()
    expect(await liveLegalPages("en")).toEqual([])
    expect(await getLegalPage("not-a-page", "en")).toBeNull()

    await put({ key: "legal.privacy.body", locale: "en", action: "publish", text: "## What we collect\n\nYour name." })
    const en = await getLegalPage("privacy", "en")
    expect(en).toMatchObject({ slug: "privacy", title: "Privacy Policy", fallback: false })
    expect(en?.body).toContain("What we collect")

    const fr = await getLegalPage("privacy", "fr") // no French text yet: English body under the French title is not offered as French
    expect(fr).toMatchObject({ fallback: true, title: "Privacy Policy" })

    await put({ key: "legal.privacy.body", locale: "fr", action: "publish", text: "## Ce que nous collectons" })
    expect(await getLegalPage("privacy", "fr")).toMatchObject({ fallback: false, title: "Politique de confidentialité" })
    expect((await liveLegalPages("de")).map((p) => p.slug)).toEqual(["privacy"]) // German falls back to English
  })
})
