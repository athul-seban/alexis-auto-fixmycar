import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(10),
  garageName: z.string().min(2),
  garagePhone: z.string().min(10),
  garageEmail: z.string().email(),
  address: z.string().min(5),
  city: z.string().min(2),
  postcode: z.string().min(5),
  description: z.string().optional(),
  isMobile: z.boolean().default(false),
  services: z.array(z.string()).min(1),
})

export async function POST(req: Request) {
  try {
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
        phone: data.phone,
        password: hashedPassword,
        role: "GARAGE",
        garage: {
          create: {
            name: data.garageName,
            slug,
            phone: data.garagePhone,
            email: data.garageEmail,
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
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Garage register error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
