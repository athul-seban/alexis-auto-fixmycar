import { NextResponse } from "next/server"
import { getServerSession, type Session } from "next-auth"
import { authOptions } from "@/lib/auth"

export interface SessionUser {
  id: string
  role: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export type RequiredSession = { ok: true; session: Session; user: SessionUser } | { ok: false; response: NextResponse }

/**
 * The signed-in user, or a ready 401. Use it in any route that puts `user.id` into a database filter:
 *
 *   const auth = await requireSession()
 *   if (!auth.ok) return auth.response
 *   const { user } = auth
 *
 * It insists on a real string id, so even if a session slipped through without one (Prisma silently drops a filter whose
 * value is `undefined`, which turns "my rows" into "everyone's rows") the request is refused.
 */
export async function requireSession(): Promise<RequiredSession> {
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!session || !user || typeof user.id !== "string" || user.id === "" || typeof user.role !== "string") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { ok: true, session, user: user as SessionUser }
}
