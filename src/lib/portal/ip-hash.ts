import { createHash } from "crypto"

/**
 * Best-effort client IP, else "unknown". Resolution order:
 *  1. `x-vercel-forwarded-for` — set by Vercel's edge, which a client can't spoof.
 *  2. `x-forwarded-for`. Clients can prepend their own entries, so when the app sits behind N
 *     trusted proxies set TRUSTED_PROXY_HOPS=N and the entry the nearest trusted proxy appended
 *     (N from the right) is used. Unset means "take the first entry" (fine when there is one
 *     proxy that overwrites the header, otherwise spoofable — see CLAUDE.md).
 *  3. `x-real-ip`.
 */
export function clientIp(headers: Headers, trustedHops: number = Number(process.env.TRUSTED_PROXY_HOPS) || 0): string {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
  if (vercel) return vercel

  const xff = headers.get("x-forwarded-for")
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) return trustedHops > 0 ? parts[Math.max(0, parts.length - trustedHops)] : parts[0]
  }
  return headers.get("x-real-ip")?.trim() || "unknown"
}

/**
 * One-way hash of an IP, so abuse limiting works without storing raw addresses. Salted with a
 * server secret so the hashes can't be reversed by brute-forcing the IPv4 space.
 */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-only-ip-hash-secret"
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32)
}
