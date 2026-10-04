import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { bookingConfirmedGuestNotification, bookingConfirmedGarageNotification } from "@/lib/email-templates"
import { acceptJobResponse } from "@/lib/portal/booking-service"
import { notifyGarage } from "@/lib/notifications"
import { emailGarage } from "@/lib/portal/garage-email"
import { garageLinks } from "@/lib/portal/links"
import { handleRouteError } from "@/lib/portal/route-errors"
import { z } from "zod"

const acceptSchema = z.object({
  jobResponseId: z.string(),
})

interface Params {
  params: Promise<{ token: string }>
}

export async function POST(req: Request, props: Params) {
  const params = await props.params
  try {
    const body = await req.json()
    const { jobResponseId } = acceptSchema.parse(body)

    const found = await prisma.jobRequest.findUnique({ where: { token: params.token }, select: { id: true } })
    if (!found) return NextResponse.json({ error: "Job request not found" }, { status: 404 })

    // Atomic: booking + account/vehicle + response/request status changes.
    const { booking, jobRequest, jobResponse } = await acceptJobResponse({
      jobRequestId: found.id,
      jobResponseId,
    })

    await Promise.allSettled([
      sendMail({
        to: jobRequest.guestEmail,
        ...bookingConfirmedGuestNotification({ jobRequest, garage: jobResponse.garage, price: jobResponse.price }),
      }),
      emailGarage(jobResponse.garageId, "emailNewBooking", () =>
        bookingConfirmedGarageNotification({ jobRequest, price: jobResponse.price })
      ),
      notifyGarage({
        garageId: jobResponse.garageId,
        type: "JOB_RESPONSE_ACCEPTED",
        title: "Your quote was accepted",
        body: `${jobRequest.guestName} accepted your quote for ${jobRequest.serviceType}`,
        link: garageLinks.booking(booking.id),
      }),
    ])

    return NextResponse.json({ booking }, { status: 201 })
  } catch (err) {
    return handleRouteError(err, "Job request accept")
  }
}
