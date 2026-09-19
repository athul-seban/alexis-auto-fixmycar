import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { bookingConfirmedGuestNotification, bookingConfirmedGarageNotification } from "@/lib/email-templates"
import { z } from "zod"

const acceptSchema = z.object({
  jobResponseId: z.string(),
})

interface Params {
  params: Promise<{ token: string }>
}

export async function POST(req: Request, props: Params) {
  const params = await props.params;
  try {
    const body = await req.json()
    const { jobResponseId } = acceptSchema.parse(body)

    const jobRequest = await prisma.jobRequest.findUnique({ where: { token: params.token } })
    if (!jobRequest) return NextResponse.json({ error: "Job request not found" }, { status: 404 })

    if (jobRequest.status === "BOOKED") {
      return NextResponse.json({ error: "This job has already been booked" }, { status: 409 })
    }

    const jobResponse = await prisma.jobResponse.findUnique({
      where: { id: jobResponseId },
      include: { garage: true },
    })
    if (!jobResponse || jobResponse.jobRequestId !== jobRequest.id) {
      return NextResponse.json({ error: "Quote not found for this job request" }, { status: 404 })
    }

    let user = await prisma.user.findUnique({ where: { email: jobRequest.guestEmail } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: jobRequest.guestName,
          email: jobRequest.guestEmail,
          phone: jobRequest.guestPhone,
          role: "OWNER",
        },
      })
    }

    let vehicle = await prisma.vehicle.findFirst({
      where: { ownerId: user.id, registration: jobRequest.registration },
    })
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          ownerId: user.id,
          registration: jobRequest.registration,
          make: jobRequest.make,
          model: jobRequest.model,
          year: jobRequest.year,
          fuel: jobRequest.fuel,
          mileage: jobRequest.mileage,
        },
      })
    }

    const booking = await prisma.booking.create({
      data: {
        ownerId: user.id,
        vehicleId: vehicle.id,
        garageId: jobResponse.garageId,
        jobResponseId: jobResponse.id,
        serviceType: jobRequest.serviceType,
        description: jobRequest.description,
        status: "PENDING",
        scheduledAt: jobRequest.preferredDate ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        totalPrice: jobResponse.price,
      },
    })

    await prisma.jobResponse.update({ where: { id: jobResponse.id }, data: { status: "ACCEPTED" } })
    await prisma.jobResponse.updateMany({
      where: { jobRequestId: jobRequest.id, id: { not: jobResponse.id } },
      data: { status: "DECLINED" },
    })
    await prisma.jobRequest.update({ where: { id: jobRequest.id }, data: { status: "BOOKED" } })
    await prisma.garage.update({ where: { id: jobResponse.garageId }, data: { totalBookings: { increment: 1 } } })

    await Promise.allSettled([
      sendMail({
        to: jobRequest.guestEmail,
        ...bookingConfirmedGuestNotification({ jobRequest, garage: jobResponse.garage, price: jobResponse.price }),
      }),
      sendMail({
        to: jobResponse.garage.email,
        ...bookingConfirmedGarageNotification({ jobRequest, price: jobResponse.price }),
      }),
    ])

    return NextResponse.json({ booking }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Job request accept error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
