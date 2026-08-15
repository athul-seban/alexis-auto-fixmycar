import crypto from "crypto"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { findMatchingGaragesForJob, findMatchingJobRequestsForGarage } from "@/lib/job-matching"
import { sendMail } from "@/lib/mail"
import { jobRequestGarageNotification, jobRequestGuestConfirmation } from "@/lib/email-templates"
import { z } from "zod"

const createSchema = z.object({
  guestName: z.string().min(2),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(10),
  registration: z.string().min(2),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1970).max(new Date().getFullYear() + 1),
  fuel: z.string().optional(),
  mileage: z.number().int().positive().optional(),
  serviceType: z.string(),
  description: z.string().min(10),
  city: z.string().min(2),
  postcode: z.string().min(5),
  isMobilePreferred: z.boolean().default(false),
  preferredDate: z.string().datetime().optional(),
})

async function generateUniqueToken(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = crypto.randomBytes(24).toString("hex")
    const existing = await prisma.jobRequest.findUnique({ where: { token } })
    if (!existing) return token
  }
  throw new Error("Failed to generate a unique token")
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    const token = await generateUniqueToken()

    const jobRequest = await prisma.jobRequest.create({
      data: {
        ...data,
        postcode: data.postcode.toUpperCase(),
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : undefined,
        token,
        status: "OPEN",
      },
    })

    const matchedGarages = await findMatchingGaragesForJob({
      city: data.city,
      postcode: data.postcode,
      serviceType: data.serviceType,
      mobileOnly: data.isMobilePreferred,
    })

    await Promise.allSettled(
      matchedGarages.map((garage) =>
        sendMail({
          to: garage.email,
          ...jobRequestGarageNotification({ garage, jobRequest }),
        })
      )
    )

    await sendMail({
      to: data.guestEmail,
      ...jobRequestGuestConfirmation({ jobRequest, matchedCount: matchedGarages.length }),
    })

    return NextResponse.json(
      {
        jobRequest: { id: jobRequest.id, token: jobRequest.token, status: jobRequest.status, createdAt: jobRequest.createdAt },
        matchedGarageCount: matchedGarages.length,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Job requests POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const jobs = await findMatchingJobRequestsForGarage(garage)
    const mapped = jobs.map((job) => ({
      ...job,
      hasResponded: job.responses.length > 0,
      myResponse: job.responses[0] ?? null,
    }))

    return NextResponse.json({ jobRequests: mapped })
  } catch (err) {
    console.error("Job requests GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
