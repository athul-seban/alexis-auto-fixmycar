import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { isSuperAdmin } from "@/lib/roles"
import { testMotConnection } from "@/lib/mot-history"
import { SETTING_KEYS, clearSetting, saveSetting, settingStatuses } from "@/lib/platform-settings"

// Platform credentials. Super admins only (an ordinary admin gets 401). Secrets are write-only: GET returns the last
// four characters of a secret, never the value, and the audit log records which key changed but not what it changed to.

async function superAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  return isSuperAdmin(user?.role) && user?.id ? { session, id: user.id } : null
}

export async function GET() {
  if (!(await superAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ settings: await settingStatuses() })
}

const saveSchema = z.object({
  key: z.enum(SETTING_KEYS),
  // A single line: credentials never contain newlines, and a pasted one would break the HTTP header.
  value: z.string().trim().min(1, "Enter a value").max(2000).regex(/^[^\r\n]+$/, "The value must be a single line"),
})

export async function PUT(req: Request) {
  const who = await superAdmin()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  await saveSetting(parsed.data.key, parsed.data.value, who.id)
  await audit(who.session, { action: "SETTING_UPDATED", targetType: "SETTING", targetId: parsed.data.key, detail: `Saved ${parsed.data.key}` })
  return NextResponse.json({ ok: true, settings: await settingStatuses() })
}

const keySchema = z.object({ key: z.enum(SETTING_KEYS) })

/** Remove the saved value; the environment variable of the same name (if any) applies again. */
export async function DELETE(req: Request) {
  const who = await superAdmin()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = keySchema.safeParse({ key: new URL(req.url).searchParams.get("key") })
  if (!parsed.success) return NextResponse.json({ error: "Unknown setting" }, { status: 400 })

  await clearSetting(parsed.data.key)
  await audit(who.session, { action: "SETTING_CLEARED", targetType: "SETTING", targetId: parsed.data.key, detail: `Cleared ${parsed.data.key}` })
  return NextResponse.json({ ok: true, settings: await settingStatuses() })
}

const testSchema = z.object({ action: z.literal("test"), target: z.literal("dvsa") })

export async function POST(req: Request) {
  const who = await superAdmin()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!testSchema.safeParse(await req.json().catch(() => null)).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const result = await testMotConnection()
  await audit(who.session, { action: "SETTING_TESTED", targetType: "SETTING", targetId: "DVSA", detail: result.ok ? "Passed" : "Failed" })
  return NextResponse.json(result)
}
