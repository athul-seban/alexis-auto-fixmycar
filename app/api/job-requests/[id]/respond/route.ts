import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { sendMail } from "@/lib/mail"
import { jobResponseGuestNotification } from "@/lib/email-templates"
import { z } from "zod"

const respondSchema = z.object({
  price: z.number().positive(),
  laborCost: z.number().positive().optional(),
  partsCost: z.number().positive().optional(),
  message: z.string().optional(),
  validDays: z.number().min(1).max(30).default(7),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, props: Params) {
  const params = await props.params;
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const jobRequest = await prisma.jobRequest.findUnique({ where: { id: params.id } })
    if (!jobRequest) return NextResponse.json({ error: "Job request not found" }, { status: 404 })

    if (jobRequest.status === "BOOKED" || jobRequest.status === "CANCELLED") {
      return NextResponse.json({ error: "This job is no longer accepting quotes" }, { status: 409 })
    }

    const existing = await prisma.jobResponse.findUnique({
      where: { jobRequestId_garageId: { jobRequestId: jobRequest.id, garageId: garage.id } },
    })
    if (existing) {
      return NextResponse.json({ error: "You've already responded to this job request" }, { status: 409 })
    }

    const body = await req.json()
    const data = respondSchema.parse(body)

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + data.validDays)

    const jobResponse = await prisma.jobResponse.create({
      data: {
        jobRequestId: jobRequest.id,
        garageId: garage.id,
        price: data.price,
        laborCost: data.laborCost,
        partsCost: data.partsCost,
        message: data.message,
        validUntil,
        status: "SENT",
      },
    })

    if (jobRequest.status === "OPEN") {
      await prisma.jobRequest.update({ where: { id: jobRequest.id }, data: { status: "QUOTED" } })
    }

    await sendMail({
      to: jobRequest.guestEmail,
      ...jobResponseGuestNotification({ jobRequest, jobResponse, garage }),
    })

    return NextResponse.json({ jobResponse }, { status: 201 })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You've already responded to this job request" }, { status: 409 })
    }
    console.error("Job response POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
