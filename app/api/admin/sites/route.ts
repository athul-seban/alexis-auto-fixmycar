import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { handleRouteError } from "@/lib/portal/route-errors"
import { isAdmin } from "@/lib/roles"
import { SITE_STATUSES, applySiteAction, listSites, siteActionSchema } from "@/lib/site/site-admin"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  return session && isAdmin((session.user as { role?: string }).role) ? session : null
}

/** Business websites by status (default: waiting for review), with search and paging. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const asked = sp.get("status") ?? "PENDING_REVIEW"
  const status = (SITE_STATUSES as readonly string[]).includes(asked) ? asked : "PENDING_REVIEW"
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize")) || 10))
  try {
    return NextResponse.json(await listSites({ status, q: sp.get("q") ?? undefined, page, pageSize }))
  } catch (err) {
    return handleRouteError(err, "Admin sites GET")
  }
}

/** Approve a first publish, send it back with a reason, or switch a site off or back on. */
export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const input = siteActionSchema.parse(await req.json().catch(() => null))
    const site = await applySiteAction(session, (session.user as { id?: string }).id ?? null, input)
    return NextResponse.json({ site })
  } catch (err) {
    return handleRouteError(err, "Admin sites POST")
  }
}
