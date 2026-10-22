import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { handleRouteError } from "@/lib/portal/route-errors"
import { SITE_STATUSES, applySiteAction, listSites, siteActionSchema } from "@/lib/site/site-admin"

/** Business websites by status (default: waiting for review), with search and paging. */
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
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
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const input = siteActionSchema.parse(await req.json().catch(() => null))
    const site = await applySiteAction(auth.session, auth.user.id, input)
    return NextResponse.json({ site })
  } catch (err) {
    return handleRouteError(err, "Admin sites POST")
  }
}
