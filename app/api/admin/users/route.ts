import crypto from "crypto"
import { audit } from "@/lib/audit"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { z } from "zod"
import { ROLES, isAdmin, isSuperAdmin } from "@/lib/roles"
import { requireAdmin } from "@/lib/admin-auth"
import { errorCode } from "@/lib/errors"

const updateSchema = z.object({
  userId: z.string(),
  role: z.enum(ROLES).optional(),
  suspended: z.boolean().optional(),
})

const SUPER_ONLY = "Only a super admin can manage admin accounts"

// Admin-level accounts (ADMIN, SUPER_ADMIN) can only be created, changed, suspended, reset or deleted by a super
// admin. Together with "nobody edits themselves" this also means the last super admin can never be removed: whoever
// is acting on a super admin is another super admin, who stays.
async function touchesAdminAccount(actorRole: string | undefined, userId: string, newRole?: string): Promise<boolean> {
  if (isSuperAdmin(actorRole)) return false
  if (isAdmin(newRole)) return true
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return isAdmin(target?.role)
}

const actionSchema = z.object({
  userId: z.string(),
  action: z.literal("send_password_reset"),
})

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const role = searchParams.get("role")
  const q = searchParams.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const where = role ? { role } : undefined
  // Text search is in memory (SQLite/Postgres differ on case-insensitive contains); plain browsing pages in the DB.
  const users = await prisma.user.findMany({
    where,
    ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      suspendedAt: true,
      _count: { select: { bookings: true } },
      garage: { select: { totalBookings: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const filtered = q
    ? users.filter(
        (u) => u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
    : users

  const total = q ? filtered.length : await prisma.user.count({ where })
  const pageItems = q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

  return NextResponse.json({
    users: pageItems.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      joinedAt: u.createdAt,
      suspended: !!u.suspendedAt,
      bookings: u.role === "GARAGE" ? u.garage?.totalBookings ?? 0 : u._count.bookings,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { session, user: admin } = auth
  const adminId = admin.id
  const actorRole = admin.role

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.userId === adminId) {
      if (data.role && data.role !== actorRole) {
        return NextResponse.json({ error: "You can't change your own role" }, { status: 400 })
      }
      if (data.suspended) {
        return NextResponse.json({ error: "You can't suspend your own account" }, { status: 400 })
      }
    }

    if (await touchesAdminAccount(actorRole, data.userId, data.role)) {
      return NextResponse.json({ error: SUPER_ONLY }, { status: 403 })
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        role: data.role,
        suspendedAt: data.suspended === undefined ? undefined : data.suspended ? new Date() : null,
      },
    })

    if (data.role !== undefined) await audit(session, { action: "USER_ROLE", targetType: "USER", targetId: user.id, detail: `${user.email} → ${data.role}` })
    if (data.suspended !== undefined) await audit(session, { action: data.suspended ? "USER_SUSPENDED" : "USER_REINSTATED", targetType: "USER", targetId: user.id, detail: user.email })
    return NextResponse.json({
      user: { id: user.id, role: user.role, suspended: !!user.suspendedAt },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    console.error("Admin user PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { session } = auth

  try {
    const body = await req.json()
    const { userId } = actionSchema.parse(body)

    if (await touchesAdminAccount(auth.user.role, userId)) {
      return NextResponse.json({ error: SUPER_ONLY }, { status: 403 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.password) {
      return NextResponse.json({ error: "This user can't reset a password (no password-based login)" }, { status: 400 })
    }

    const token = crypto.randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.verificationToken.deleteMany({ where: { identifier: user.email } })
    await prisma.verificationToken.create({ data: { identifier: user.email, token, expires } })

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
    await sendMail({
      to: user.email,
      subject: "Reset your Quote My Garage password",
      html: `
        <p>An administrator has triggered a password reset for your Quote My Garage account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't expect this, contact support.</p>
      `,
    })

    await audit(session, { action: "USER_RESET", targetType: "USER", targetId: userId, detail: user.email })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    console.error("Admin user POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { session, user: admin } = auth

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  if (userId === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 })
  }
  if (await touchesAdminAccount(admin.role, userId)) {
    return NextResponse.json({ error: SUPER_ONLY }, { status: 403 })
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, garage: { select: { id: true } }, _count: { select: { memberships: true } } } })
    // People who run a garage business can't be deleted out from under it: the owner of a location, or any member, would
    // leave the business without them (and a deleted owner can't be recovered). Suspend them, or have the business's own
    // owner remove them, which keeps the history.
    if (target && (target.garage || target._count.memberships > 0)) {
      return NextResponse.json(
        { error: "This person works for a garage business, so they can't be deleted. Suspend them instead, or remove them from the business first." },
        { status: 409 }
      )
    }
    await prisma.user.delete({ where: { id: userId } })
    await audit(session, { action: "USER_DELETED", targetType: "USER", targetId: userId, detail: target?.email ?? null })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (errorCode(err) === "P2003") {
      return NextResponse.json(
        { error: "This user has related records (quotes, bookings, etc.) and can't be deleted. Suspend them instead." },
        { status: 409 }
      )
    }
    console.error("Admin user DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
