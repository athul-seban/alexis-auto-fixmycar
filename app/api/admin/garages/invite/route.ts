import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { isSuperAdmin } from "@/lib/roles"
import { slugify } from "@/lib/utils"
import { sendGarageInvite } from "@/lib/garage-invite"
import { createBusiness } from "@/lib/org/create"

// Onboard a garage that someone else owns. The super admin supplies only the business name, the owner and a city;
// the owner sets their own password from the emailed link and fills in the rest of the profile. The garage starts
// PENDING: it can't pass the readiness check with an empty profile, and approving goes through the normal flow.

async function superAdmin() {
  const session = await getServerSession(authOptions)
  return isSuperAdmin((session?.user as { role?: string } | undefined)?.role) ? session : null
}

const inviteSchema = z.object({
  garageName: z.string().trim().min(2, "Enter the garage's name").max(120),
  ownerName: z.string().trim().min(2, "Enter the owner's name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  city: z.string().trim().min(2, "Enter a city").max(80),
})

export async function POST(req: Request) {
  const session = await superAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 })
  const data = parsed.data

  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return NextResponse.json({ error: "That email already has an account." }, { status: 409 })
  }

  const baseSlug = slugify(data.garageName) || "garage"
  let slug = baseSlug
  for (let n = 1; await prisma.garage.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${baseSlug}-${n}`

  // address/postcode/phone are required columns; blank until the owner completes their profile (readiness flags them).
  // The owner gets the business, its roles, this first location and the Owner role together.
  const created = await createBusiness({
    owner: { data: { name: data.ownerName, email: data.email } },
    location: { name: data.garageName, slug, email: data.email, phone: "", address: "", city: data.city, postcode: "", status: "PENDING" },
  })
  const garage = { id: created.garage.id, slug: created.garage.slug }

  const invite = await sendGarageInvite({ email: data.email, name: data.ownerName }, data.garageName)
  await audit(session, { action: "GARAGE_INVITED", targetType: "GARAGE", targetId: garage.id, detail: `${data.garageName} · ${data.email}${invite.sent ? "" : " · email not sent"}` })

  return NextResponse.json({ garage, emailSent: invite.sent, ...(invite.devUrl ? { devUrl: invite.devUrl } : {}) }, { status: 201 })
}

const resendSchema = z.object({ garageId: z.string().min(1) })

/** Send a fresh link to an owner who hasn't set a password yet. */
export async function PATCH(req: Request) {
  const session = await superAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = resendSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 })

  const garage = await prisma.garage.findUnique({ where: { id: parsed.data.garageId }, select: { id: true, name: true, user: { select: { email: true, name: true, password: true } } } })
  if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })
  if (garage.user.password) return NextResponse.json({ error: "The owner has already set a password." }, { status: 409 })

  const invite = await sendGarageInvite({ email: garage.user.email, name: garage.user.name }, garage.name)
  await audit(session, { action: "GARAGE_INVITE_RESENT", targetType: "GARAGE", targetId: garage.id, detail: `${garage.name} · ${garage.user.email}${invite.sent ? "" : " · email not sent"}` })
  return NextResponse.json({ emailSent: invite.sent, ...(invite.devUrl ? { devUrl: invite.devUrl } : {}) })
}
