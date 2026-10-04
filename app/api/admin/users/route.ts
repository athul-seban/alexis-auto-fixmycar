import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { sendMail } from "@/lib/mail"
import { z } from "zod"

const updateSchema = z.object({
  userId: z.string(),
  role: z.enum(["OWNER", "GARAGE", "ADMIN"]).optional(),
  suspended: z.boolean().optional(),
})

const actionSchema = z.object({
  userId: z.string(),
  action: z.literal("send_password_reset"),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const adminId = (session.user as any).id

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    if (data.userId === adminId) {
      if (data.role && data.role !== "ADMIN") {
        return NextResponse.json({ error: "You can't change your own role" }, { status: 400 })
      }
      if (data.suspended) {
        return NextResponse.json({ error: "You can't suspend your own account" }, { status: 400 })
      }
    }

    const user = await prisma.user.update({
      where: { id: data.userId },
      data: {
        role: data.role,
        suspendedAt: data.suspended === undefined ? undefined : data.suspended ? new Date() : null,
      },
    })

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
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { userId } = actionSchema.parse(body)

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
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const adminId = (session.user as any).id

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  if (userId === adminId) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id: userId } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "This user has related records (quotes, bookings, etc.) and can't be deleted. Suspend them instead." },
        { status: 409 }
      )
    }
    console.error("Admin user DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
