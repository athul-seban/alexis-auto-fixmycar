import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { absoluteUrl } from "@/lib/portal/links"

// Unsubscribe links carry an HMAC of the address and scope, so nobody can unsubscribe (or probe) someone else by
// guessing a URL. scope is "ALL" or a garage id: "no more from this garage" vs "no more marketing-type mail at all".

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s && process.env.NODE_ENV === "production") throw new Error("NEXTAUTH_SECRET is not set")
  return s ?? "dev-only-unsubscribe-secret"
}

const sign = (email: string, scope: string) =>
  crypto.createHmac("sha256", secret()).update(`${email.toLowerCase()}|${scope}`).digest("base64url")

export const normaliseEmail = (email: string) => email.trim().toLowerCase()

export function unsubscribeToken(email: string, scope = "ALL"): string {
  const payload = Buffer.from(JSON.stringify({ e: normaliseEmail(email), s: scope })).toString("base64url")
  return `${payload}.${sign(email, scope)}`
}

export function parseUnsubscribeToken(token: string): { email: string; scope: string } | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  try {
    const { e, s } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: unknown; s?: unknown }
    if (typeof e !== "string" || typeof s !== "string") return null
    const expected = sign(e, s)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    return { email: e, scope: s }
  } catch {
    return null
  }
}

export function unsubscribeUrl(email: string, scope = "ALL"): string {
  return absoluteUrl(`/unsubscribe?t=${unsubscribeToken(email, scope)}`)
}

/** Headers for marketing-type mail: shows the mail client's own "Unsubscribe" button (RFC 8058 one-click). */
export function unsubscribeHeaders(email: string, scope = "ALL"): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email, scope)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

export async function suppress(email: string, scope = "ALL", reason = "UNSUBSCRIBED"): Promise<void> {
  const e = normaliseEmail(email)
  await prisma.emailSuppression.upsert({
    where: { email_scope: { email: e, scope } },
    create: { email: e, scope, reason },
    update: {},
  })
  if (scope === "ALL") {
    // Account holders: keep the account setting in step so the dashboard shows the truth.
    await prisma.user.updateMany({ where: { email: e }, data: { marketingOptIn: false } })
  }
}

/** May we send this address mail it didn't just ask for (review requests, reminders, offers) on behalf of this garage? */
export async function canEmailMarketing(email: string, garageId?: string): Promise<boolean> {
  const e = normaliseEmail(email)
  const hit = await prisma.emailSuppression.findFirst({
    where: { email: e, scope: { in: garageId ? ["ALL", garageId] : ["ALL"] } },
    select: { id: true },
  })
  return !hit
}
