import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token, password } = schema.parse(body)

    const record = await prisma.verificationToken.findUnique({ where: { token } })
    if (!record || record.expires < new Date()) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: record.identifier } })
    if (!user) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null },
    })

    await prisma.verificationToken.delete({ where: { token } }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    console.error("Reset password error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
