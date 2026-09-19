import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

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

    return NextResponse.json({ garage })
  } catch (err) {
    console.error("Garage GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, props: Params) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const garage = await prisma.garage.findFirst({
      where: { id: params.id, userId: user.id },
    })

    if (!garage) {
      return NextResponse.json({ error: "Garage not found or unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const updated = await prisma.garage.update({
      where: { id: params.id },
      data: {
        name: body.name,
        description: body.description,
        phone: body.phone,
        email: body.email,
        website: body.website,
        address: body.address,
        city: body.city,
        postcode: body.postcode?.toUpperCase(),
        isMobile: body.isMobile,
        services: body.services ? JSON.stringify(body.services) : undefined,
        openingHours: body.openingHours ? JSON.stringify(body.openingHours) : undefined,
      },
    })

    return NextResponse.json({ garage: updated })
  } catch (err) {
    console.error("Garage PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
