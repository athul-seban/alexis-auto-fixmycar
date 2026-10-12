import crypto from "crypto"
import { limitByIp } from "@/lib/rate-limit"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { parseServiceList } from "@/lib/garage-mapper"
import { emailGarage } from "@/lib/portal/garage-email"
import { findMatchingGaragesForJob, findMatchingJobRequestsForGarage, toGarageJobView } from "@/lib/job-matching"
import { sendMail } from "@/lib/mail"
import { garageEnquiryEmail, jobRequestGuestConfirmation } from "@/lib/email-templates"
import { z } from "zod"
import { SERVICE_TYPES } from "@/lib/constants"

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
  serviceType: z.enum(SERVICE_TYPES),
  description: z.string().min(10),
  city: z.string().min(2),
  postcode: z.string().min(5),
  isMobilePreferred: z.boolean().default(false),
  preferredDate: z.string().datetime().optional(),
  // Ask one garage (by its profile slug) instead of every matching garage.
  garageSlug: z.string().trim().min(1).max(120).optional(),
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
    // Public form: cap posts per visitor so it can't be used to spam garages.
    const limited = await limitByIp(req.headers, "jobrequest", 5, 60 * 60 * 1000)
    if (limited) return limited

    const body = await req.json()
    const { garageSlug, ...data } = createSchema.parse(body)

    let target: { id: string; services: string } | null = null
    if (garageSlug) {
      target = await prisma.garage.findFirst({ where: { slug: garageSlug, status: "APPROVED" }, select: { id: true, services: true } })
      if (!target) return NextResponse.json({ error: "That garage isn't available for quote requests" }, { status: 404 })
      if (!(parseServiceList(target.services) as string[]).includes(data.serviceType)) {
        return NextResponse.json({ error: "That garage doesn't offer this service" }, { status: 400 })
      }
    }
    const token = await generateUniqueToken()

    const jobRequest = await prisma.jobRequest.create({
      data: {
        ...data,
        postcode: data.postcode.toUpperCase(),
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : undefined,
        token,
        status: "OPEN",
        targetGarageId: target?.id ?? null,
      },
    })

    const matchedGarages = await findMatchingGaragesForJob({
      city: data.city,
      postcode: data.postcode,
      serviceType: data.serviceType,
      mobileOnly: data.isMobilePreferred,
      targetGarageId: target?.id,
    })

    // Respects each garage's "New quote requests" email setting.
    await Promise.allSettled(
      matchedGarages.map((garage) =>
        emailGarage(garage.id, "emailEnquiry", (g, t) =>
          garageEnquiryEmail({ garageName: g.name, jobRequest, targeted: !!target, t })
        )
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
      ...toGarageJobView(job),
      hasResponded: job.responses.length > 0,
      myResponse: job.responses[0] ?? null,
    }))

    return NextResponse.json({ jobRequests: mapped })
  } catch (err) {
    console.error("Job requests GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
