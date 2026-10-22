import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { handleRouteError } from "@/lib/portal/route-errors"
import { limitByIp } from "@/lib/rate-limit"
import { acceptInvite, acceptSchema, previewInvite } from "@/lib/org/staff-service"

// Public: the emailed staff-invitation link. The token in the path is the only credential, and these answers reveal
// nothing about a business unless it is a valid one.

type Ctx = { params: Promise<{ token: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const limited = await limitByIp(req.headers, "join-preview", 60, 60 * 60 * 1000)
  if (limited) return limited
  return NextResponse.json(await previewInvite((await params).token), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const limited = await limitByIp(req.headers, "join-accept", 20, 60 * 60 * 1000)
    if (limited) return limited
    const body = acceptSchema.parse(await req.json().catch(() => ({})))
    const session = await getServerSession(authOptions)
    const result = await acceptInvite((await params).token, body, session?.user?.id ?? null)
    return NextResponse.json({ userId: result.userId, converted: result.converted }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return handleRouteError(err, "Join POST")
  }
}
