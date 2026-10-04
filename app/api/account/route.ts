import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { normalisePhone } from "@/lib/portal/phone"

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100).optional(),
    phone: z.string().trim().max(30).optional().nullable(),
    smsOptIn: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nothing to update")

async function currentUserId() {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

/** The signed-in user's own profile (any role). */
export async function GET() {
  const id = await currentUserId()
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true, phone: true, password: true, smsOptIn: true } })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ name: user.name, email: user.email, phone: user.phone, smsOptIn: user.smsOptIn, hasPassword: Boolean(user.password) })
}

export async function PATCH(req: Request) {
  const id = await currentUserId()
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { name, phone, smsOptIn } = patchSchema.parse(await req.json())
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(phone !== undefined ? { phone: phone ? normalisePhone(phone) : null } : {}),
        ...(smsOptIn !== undefined ? { smsOptIn } : {}),
      },
      select: { name: true, email: true, phone: true, smsOptIn: true },
    })
    return NextResponse.json({ user })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid data" }, { status: 400 })
    console.error("Account PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
