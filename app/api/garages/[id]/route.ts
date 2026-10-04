import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { toGarageProfile } from "@/lib/garage-mapper"
import { parseServiceList } from "@/lib/garage-mapper"
import { SERVICE_TYPES } from "@/lib/constants"
import { openingHoursSchema } from "@/lib/portal/opening-hours"
import { handleRouteError } from "@/lib/portal/route-errors"
import { z } from "zod"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, props: Params) {
  const params = await props.params;
  try {
    const garage = await prisma.garage.findFirst({
      where: {
        OR: [{ id: params.id }, { slug: params.id }],
        status: "APPROVED",
      },
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { owner: { select: { name: true, image: true } } },
        },
        _count: { select: { bookings: true, reviews: true } },
      },
    })

    if (!garage) {
      return NextResponse.json({ error: "Garage not found" }, { status: 404 })
    }

    const profile = toGarageProfile(garage)
    const reviews = garage.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      reply: r.reply,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      owner: r.owner,
    }))
    const verificationBadges = parseServiceList((garage as any).verificationBadges)

    // Published prices: only services the garage still offers and hasn't switched off.
    const offered = new Set<string>(parseServiceList(garage.services))
    const priceRows = await prisma.servicePrice.findMany({ where: { garageId: garage.id, isActive: true } })
    const prices = priceRows
      .filter((p) => offered.has(p.serviceType) && (p.priceFrom !== null || p.priceTo !== null))
      .map((p) => ({ serviceType: p.serviceType, priceFrom: p.priceFrom, priceTo: p.priceTo, durationMins: p.durationMins, notes: p.notes }))

    return NextResponse.json({ garage: { ...profile, verificationBadges, reviews, prices } })
  } catch (err) {
    console.error("Garage GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// z.string().url() also accepts javascript:/data: URIs, which would become clickable links on the
// public profile — only http(s) is allowed.
const httpUrl = (message: string) =>
  z.string().trim().url(message).max(500).refine((u) => /^https?:\/\//i.test(u), message)

const patchSchema = z.object({
  name: z.string().trim().min(2, "Garage name is too short").max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30).optional(),
  email: z.string().trim().email("Enter a valid email address").max(200).optional(),
  website: z.union([httpUrl("Website must start with http:// or https://"), z.literal("")]).nullable().optional(),
  address: z.string().trim().min(3).max(200).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  postcode: z.string().trim().min(3, "Enter a valid postcode").max(10).optional(),
  isMobile: z.boolean().optional(),
  services: z.array(z.enum(SERVICE_TYPES)).max(SERVICE_TYPES.length).optional(),
  openingHours: openingHoursSchema.optional(),
  logo: httpUrl("Logo must be an http(s) image URL").nullable().optional(),
})

export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findFirst({
      where: { id: params.id, userId: user.id },
    })

    if (!garage) {
      return NextResponse.json({ error: "Garage not found or unauthorized" }, { status: 403 })
    }
    if (garage.status === "SUSPENDED") {
      return NextResponse.json({ error: "Your garage is suspended — the portal is read-only", code: "GARAGE_SUSPENDED" }, { status: 403 })
    }

    const data = patchSchema.parse(await req.json())
    const updated = await prisma.garage.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description,
        phone: data.phone,
        email: data.email,
        website: data.website === undefined ? undefined : data.website || null,
        address: data.address,
        city: data.city,
        postcode: data.postcode?.toUpperCase(),
        isMobile: data.isMobile,
        services: data.services ? JSON.stringify(data.services) : undefined,
        openingHours: data.openingHours ? JSON.stringify(data.openingHours) : undefined,
        logo: data.logo,
      },
    })

    const verificationBadges = parseServiceList(updated.verificationBadges)
    return NextResponse.json({ garage: { ...toGarageProfile(updated), verificationBadges } })
  } catch (err) {
    return handleRouteError(err, "Garage PATCH")
  }
}
