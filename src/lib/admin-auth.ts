import { NextResponse } from "next/server"
import { isAdmin, isSuperAdmin } from "@/lib/roles"
import { requireSession, type RequiredSession } from "@/lib/session"

/**
 * The signed-in admin, or a ready 401. Every /api/admin/* handler starts with it:
 *
 *   const auth = await requireAdmin()
 *   if (!auth.ok) return auth.response
 *   const { user, session } = auth
 *
 * `superOnly` is for what only a super admin may do (platform settings, creating garages, granting admin roles). Not signed
 * in, a customer or garage login, and an ordinary admin asking for a super-admin action all get the same 401, so the
 * response never says which rule they missed. `architecture.test.ts` fails the build if an admin route doesn't call this.
 */
export async function requireAdmin(opts: { superOnly?: boolean } = {}): Promise<RequiredSession> {
  const auth = await requireSession()
  if (!auth.ok) return auth
  const allowed = opts.superOnly ? isSuperAdmin(auth.user.role) : isAdmin(auth.user.role)
  return allowed ? auth : { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
}
