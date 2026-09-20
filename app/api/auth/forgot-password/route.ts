import { NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { z } from "zod"

const schema = z.object({ email: z.string().email().trim().toLowerCase() })

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email } = schema.parse(body)

    // Always respond success regardless of whether the account exists,
    // so this endpoint can't be used to enumerate registered emails.
    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.password) {
      const token = crypto.randomBytes(32).toString("hex")
      const expires = new Date(Date.now() + 60 * 60 * 1000)

      await prisma.verificationToken.deleteMany({ where: { identifier: email } })
      await prisma.verificationToken.create({ data: { identifier: email, token, expires } })

      const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
      await sendMail({
        to: email,
        subject: "Reset your Quote My Garage password",
        html: `
          <p>We received a request to reset your Quote My Garage password.</p>
          <p><a href="${resetUrl}">Click here to reset your password</a></p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    console.error("Forgot password error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
