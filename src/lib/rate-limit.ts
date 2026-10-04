import { prisma } from "@/lib/prisma"

export interface RateLimitResult {
  ok: boolean
  /** Seconds until another attempt is allowed (0 when ok). */
  retryAfter: number
}

/** Rows older than this are never needed (the longest window we use is an hour). */
const PRUNE_AFTER_MS = 24 * 3_600_000

/**
 * Count-based limiter backed by the database: at most `limit` attempts per `key` in the last `windowMs`.
 * Each allowed call records an attempt. It is a soft limit (count then insert isn't atomic), which is fine for
 * abuse control; it is not a billing guard. Pass a stable key such as `login:ip:<hash>`.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now: Date = new Date()): Promise<RateLimitResult> {
  const since = new Date(now.getTime() - windowMs)
  const hits = await prisma.rateLimitHit.findMany({ where: { key, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: limit, select: { createdAt: true } })

  if (hits.length >= limit) {
    // The oldest hit in the window falling out is when a slot frees up.
    const retryAfter = Math.max(1, Math.ceil((hits[0].createdAt.getTime() + windowMs - now.getTime()) / 1000))
    return { ok: false, retryAfter }
  }

  await prisma.rateLimitHit.create({ data: { key, createdAt: now } })
  // ~1% of calls tidy up, so the table stays small without a scheduled job.
  if (Math.random() < 0.01) {
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - PRUNE_AFTER_MS) } } })
  }
  return { ok: true, retryAfter: 0 }
}

/** Convenience: 429 body for a limited request. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json({ error: "Too many requests — please wait a bit and try again.", retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } })
}

export const isLoopback = (ip: string) => ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1"

/**
 * Limit by caller IP (hashed, never stored raw). Returns a ready 429 response when limited, else null.
 * An unknown IP (no proxy headers) is not limited, otherwise everyone behind a header-less proxy would share one
 * bucket and lock each other out. Loopback addresses are skipped too: they only occur in local dev and tests
 * (a real visitor behind a proxy arrives with their own address), and would otherwise throttle test suites.
 */
export async function limitByIp(headers: Headers, name: string, limit: number, windowMs: number): Promise<Response | null> {
  const { clientIp, hashIp } = await import("@/lib/portal/ip-hash")
  const ip = clientIp(headers)
  if (ip === "unknown" || isLoopback(ip)) return null
  const r = await rateLimit(`${name}:ip:${hashIp(ip)}`, limit, windowMs)
  return r.ok ? null : tooManyRequests(r.retryAfter)
}
