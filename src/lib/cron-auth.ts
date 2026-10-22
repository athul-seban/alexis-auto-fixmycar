import crypto from "crypto"

/**
 * True when the request carries `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). Constant-time, and false
 * whenever CRON_SECRET isn't set, so a missing env var can never open the route up.
 */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = req.headers.get("authorization") ?? ""
  // Hash both sides so timingSafeEqual gets equal-length inputs without leaking the secret's length.
  const a = crypto.createHash("sha256").update(given).digest()
  const b = crypto.createHash("sha256").update(`Bearer ${secret}`).digest()
  return crypto.timingSafeEqual(a, b)
}
