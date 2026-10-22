import crypto from "crypto"
import { limitByIp } from "@/lib/rate-limit"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseServiceList } from "@/lib/garage-mapper"
import { emailGarage } from "@/lib/portal/garage-email"
import { findMatchingGaragesForJob, findMatchingJobRequestsForGarage, toGarageJobView } from "@/lib/job-matching"
import { sendMail } from "@/lib/mail"
import { garageEnquiryEmail, jobRequestGuestConfirmation } from "@/lib/email-templates"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { respondDeadline } from "@/lib/portal/quote-pricing"
import { autoQuoteJob } from "@/lib/portal/quote-request-service"
import { forbidden } from "@/lib/garage-auth"
import { can } from "@/lib/org/access"
import { garageFailureResponse, resolveActiveGarage } from "@/lib/org/resolve"
import { z } from "zod"
import { SERVICE_TYPES } from "@/lib/constants"
import { requireSession } from "@/lib/session"

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
  // One or more works. serviceType is still accepted for a single work (older clients).
  serviceType: z.enum(SERVICE_TYPES).optional(),
  services: z.array(z.enum(SERVICE_TYPES)).min(1).max(SERVICE_TYPES.length).optional(),
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
    const { garageSlug, services: requestedWorks, serviceType: singleWork, ...rest } = createSchema.parse(body)
    const works = [...new Set(requestedWorks ?? (singleWork ? [singleWork] : []))]
    if (works.length === 0) return NextResponse.json({ error: "Choose at least one service" }, { status: 400 })
    const data = { ...rest, serviceType: works[0] }

    let target: { id: string; services: string; portalSettings: string | null } | null = null
    if (garageSlug) {
      target = await prisma.garage.findFirst({ where: { slug: garageSlug, status: "APPROVED" }, select: { id: true, services: true, portalSettings: true } })
      if (!target) return NextResponse.json({ error: "That garage isn't available for quote requests" }, { status: 404 })
      const offered = parseServiceList(target.services) as string[]
      if (!works.every((w) => offered.includes(w))) {
        return NextResponse.json({ error: "That garage doesn't offer every service you chose" }, { status: 400 })
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
        services: JSON.stringify(works),
        // A garage asked directly has the time it set in Settings to quote, after which the request closes or is estimated.
        respondBy: target ? respondDeadline(new Date(), parsePortalSettings(target.portalSettings).quotes.responseHours) : null,
      },
    })

    // Every work priced automatically? Then the quote goes out now and the garage needn't be emailed to quote.
    const instantlyQuoted = target ? await autoQuoteJob(jobRequest.id).catch(() => false) : false

    const matchedGarages = await findMatchingGaragesForJob({
      city: data.city,
      postcode: data.postcode,
      serviceType: data.serviceType,
      mobileOnly: data.isMobilePreferred,
      targetGarageId: target?.id,
    })

    // Respects each garage's "New quote requests" email setting.
    await Promise.allSettled(
      (instantlyQuoted ? [] : matchedGarages).map((garage) =>
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
        instantlyQuoted,
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

export async function GET(req?: Request) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const resolved = await resolveActiveGarage(user.id, req)
    if (!resolved.ok) return garageFailureResponse(resolved.failure)
    if (!can(resolved.value.access, "enquiries.view")) return forbidden()
    const garage = resolved.value.garage

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
