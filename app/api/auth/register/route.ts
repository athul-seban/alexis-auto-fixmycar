import { NextResponse } from "next/server"
import { limitByIp } from "@/lib/rate-limit"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { newPasswordSchema } from "@/lib/password-policy"
import { formatPhone, isValidUkMobile } from "@/lib/portal/phone"

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidUkMobile(v), "Enter a valid UK mobile number, e.g. 07700 900123"),
  password: newPasswordSchema,
  role: z.enum(["OWNER", "GARAGE"]).default("OWNER"),
})

export async function POST(req: Request) {
  try {
    const limited = await limitByIp(req.headers, "register", 10, 60 * 60 * 1000)
    if (limited) return limited

    const body = await req.json()
    const data = schema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ? formatPhone(data.phone) : undefined,
        password: hashedPassword,
        role: data.role,
      },
      select: { id: true, email: true, name: true, role: true },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Register error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
