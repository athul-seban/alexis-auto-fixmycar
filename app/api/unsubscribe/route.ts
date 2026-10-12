import { NextResponse } from "next/server"
import { z } from "zod"
import { limitByIp } from "@/lib/rate-limit"
import { parseUnsubscribeToken, suppress } from "@/lib/unsubscribe"

const schema = z.object({ token: z.string().min(10).max(600) })

// Also accepts the mail client's one-click POST (RFC 8058), where the token is in the query string.
export async function POST(req: Request) {
  const limited = await limitByIp(req.headers, "unsubscribe", 20, 60 * 60 * 1000)
  if (limited) return limited

  let token: string | undefined = new URL(req.url).searchParams.get("t") ?? undefined
  if (!token) {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    token = parsed.success ? parsed.data.token : undefined
  }
  const decoded = token ? parseUnsubscribeToken(token) : null
  if (!decoded) return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 400 })

  await suppress(decoded.email, decoded.scope)
  return NextResponse.json({ success: true })
}
