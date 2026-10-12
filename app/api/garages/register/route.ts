import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"
import { z } from "zod"
import { SERVICE_TYPES } from "@/lib/constants"
import { limitByIp } from "@/lib/rate-limit"
import { newPasswordSchema } from "@/lib/password-policy"
import { formatPhone, isValidUkMobile, isValidUkPhone } from "@/lib/portal/phone"
import { formatVat, isValidUkVat } from "@/lib/portal/vat"

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().trim().toLowerCase(),
  password: newPasswordSchema,
  phone: z.string().refine(isValidUkMobile, "Enter a valid UK mobile number, e.g. 07700 900123"),
  garageName: z.string().min(2),
  garagePhone: z.string().refine(isValidUkPhone, "Enter a valid UK phone number, e.g. 020 7123 4567"),
  garageEmail: z.string().email().trim().toLowerCase(),
  vatNumber: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidUkVat(v), "Enter a valid UK VAT number, e.g. GB123456789"),
  address: z.string().min(5),
  city: z.string().min(2),
  postcode: z.string().min(5),
  description: z.string().optional(),
  isMobile: z.boolean().default(false),
  services: z.array(z.enum(SERVICE_TYPES)).min(1).max(SERVICE_TYPES.length),
})

export async function POST(req: Request) {
  try {
    const limited = await limitByIp(req.headers, "garage-register", 5, 60 * 60 * 1000)
    if (limited) return limited

    const body = await req.json()
    const data = schema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)
    const baseSlug = slugify(data.garageName)
    let slug = baseSlug
    let counter = 1
    while (await prisma.garage.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: formatPhone(data.phone),
        password: hashedPassword,
        role: "GARAGE",
        garage: {
          create: {
            name: data.garageName,
            slug,
            phone: formatPhone(data.garagePhone),
            email: data.garageEmail,
            vatNumber: data.vatNumber ? formatVat(data.vatNumber) : null,
            address: data.address,
            city: data.city,
            postcode: data.postcode.toUpperCase(),
            description: data.description,
            isMobile: data.isMobile,
            services: JSON.stringify(data.services),
            status: "PENDING",
          },
        },
      },
      select: { id: true, email: true, garage: { select: { id: true, slug: true } } },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Garage register error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
