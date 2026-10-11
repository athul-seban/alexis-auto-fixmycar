import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { revalidateTag } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { LOCALES, isLocale } from "@/lib/i18n/config"
import { MESSAGE_KEYS, defaultFor, isEnglishOnlyKey, isMessageKey } from "@/lib/i18n/messages"
import { isBodyKey, sectionLabel, validateContent } from "@/lib/i18n/content-rules"

async function admin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  return user?.role === "ADMIN" && user.id ? { session, id: user.id } : null
}

/** Every editable string for a language: built-in text, the live override and any unpublished draft. */
export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const locale = new URL(req.url).searchParams.get("locale") ?? "en"
  if (!isLocale(locale)) return NextResponse.json({ error: "Unknown language" }, { status: 400 })

  const rows = await prisma.contentEntry.findMany({ where: { locale }, select: { key: true, value: true, draft: true, updatedAt: true } })
  const byKey = new Map(rows.map((r) => [r.key, r]))

  const entries = MESSAGE_KEYS.filter((key) => locale === "en" || !isEnglishOnlyKey(key)).map((key) => {
    const row = byKey.get(key)
    return {
      key,
      section: sectionLabel(key),
      multiline: isBodyKey(key) || defaultFor(locale, key).length > 90,
      isBody: isBodyKey(key),
      english: defaultFor("en", key),
      default: defaultFor(locale, key),
      value: row?.value ?? "",
      draft: row?.draft ?? null,
      updatedAt: row?.updatedAt ?? null,
    }
  })
  return NextResponse.json({ locale, locales: LOCALES, entries })
}

const bodySchema = z.object({
  key: z.string().min(1).max(100),
  locale: z.string(),
  action: z.enum(["saveDraft", "publish", "discardDraft", "reset"]),
  text: z.string().optional(),
})

/**
 * saveDraft   store text as a draft (not live)
 * publish     make `text` (or, with no text, the saved draft) the live value
 * discardDraft drop the unpublished draft
 * reset       remove the override so the built-in text is used again
 */
export async function PUT(req: Request) {
  const who = await admin()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { key, locale, action, text } = parsed.data
  if (!isLocale(locale)) return NextResponse.json({ error: "Unknown language" }, { status: 400 })
  if (!isMessageKey(key)) return NextResponse.json({ error: "Unknown content key" }, { status: 400 })
  if (locale !== "en" && isEnglishOnlyKey(key)) return NextResponse.json({ error: "Emails are sent in English only" }, { status: 400 })

  const existing = await prisma.contentEntry.findUnique({ where: { key_locale: { key, locale } } })
  const where = { key_locale: { key, locale } }
  const base = { updatedById: who.id }

  let detail = ""
  if (action === "saveDraft" || action === "publish") {
    const next = action === "publish" ? (text ?? existing?.draft ?? "") : (text ?? "")
    const problem = validateContent(key, next)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    if (action === "saveDraft") {
      await prisma.contentEntry.upsert({ where, update: { ...base, draft: next }, create: { key, locale, value: "", draft: next, ...base } })
      detail = "Saved a draft"
    } else {
      await prisma.contentEntry.upsert({ where, update: { ...base, value: next, draft: null }, create: { key, locale, value: next, draft: null, ...base } })
      detail = next.trim() === "" ? "Published (cleared)" : "Published"
    }
  } else if (action === "discardDraft") {
    if (existing) await prisma.contentEntry.update({ where, data: { ...base, draft: null } })
    detail = "Discarded the draft"
  } else {
    if (existing) await prisma.contentEntry.delete({ where })
    detail = "Reset to the built-in text"
  }

  // Live content is cached for up to a minute; drop it so the edit shows immediately.
  revalidateTag("content", { expire: 0 })
  if (action !== "saveDraft" && action !== "discardDraft") {
    await audit(who.session, { action: action === "publish" ? "CONTENT_PUBLISHED" : "CONTENT_RESET", targetType: "CONTENT", targetId: `${locale}:${key}`, detail: `${detail}: ${key} (${locale})` })
  }
  return NextResponse.json({ ok: true })
}
