import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { sendMail } from "@/lib/mail"
import { jobResponseGuestNotification } from "@/lib/email-templates"
import { jobMatchesGarage } from "@/lib/job-matching"
import { leadDecision, monthStart } from "@/lib/portal/plans"
import { refundLeadCredit, spendLeadCredit } from "@/lib/portal/billing-service"
import { parseWorks, resolveQuoteLines } from "@/lib/portal/quote-pricing"
import { expireDueRequests } from "@/lib/portal/quote-request-service"
import { forbidden } from "@/lib/garage-auth"
import { can } from "@/lib/org/access"
import { garageFailureResponse, resolveActiveGarage } from "@/lib/org/resolve"
import { z } from "zod"

// Upper bound for any single amount a garage can quote: well above any real repair, low enough to stop absurd values.
const MAX_AMOUNT = 100_000

const respondSchema = z.object({
  // A request with several works needs an amount for each one in items; a single work may just send price.
  price: z.number().positive().max(MAX_AMOUNT).optional(),
  items: z.array(z.object({ serviceType: z.string().max(60), price: z.number().positive().max(MAX_AMOUNT) })).max(20).optional(),
  laborCost: z.number().positive().max(MAX_AMOUNT).optional(),
  partsCost: z.number().positive().max(MAX_AMOUNT).optional(),
  message: z.string().max(2000).optional(),
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
    const resolved = await resolveActiveGarage(user.id, req)
    if (!resolved.ok) return garageFailureResponse(resolved.failure)
    // Quoting spends the business's lead credits, so it is its own permission (not implied by seeing enquiries).
    if (!can(resolved.value.access, "enquiries.respond")) return forbidden()
    const garage = resolved.value.garage

    // Only live (approved) garages may quote on marketplace jobs.
    if (garage.status !== "APPROVED") {
      return NextResponse.json({ error: "Your listing isn't live, so you can't quote on jobs yet" }, { status: 403 })
    }

    // A garage that missed its deadline can no longer quote by hand (the request has closed or become an estimate).
    await expireDueRequests({ jobId: params.id })
    const jobRequest = await prisma.jobRequest.findUnique({ where: { id: params.id } })
    if (!jobRequest) return NextResponse.json({ error: "Job request not found" }, { status: 404 })
    if (!jobMatchesGarage(jobRequest, garage)) {
      return NextResponse.json({ error: "This job isn't in your area or services" }, { status: 403 })
    }

    if (jobRequest.status === "EXPIRED") {
      return NextResponse.json({ error: "The time to send a quote for this request has passed", code: "EXPIRED" }, { status: 409 })
    }
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
    const works = parseWorks(jobRequest.services, jobRequest.serviceType)
    const lines = resolveQuoteLines(works, data)
    if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: 400 })

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + data.validDays)

    // Plan limits (a no-op until PLANS_ENFORCED=true): past the monthly allowance a lead costs one credit.
    const usedThisMonth = await prisma.jobResponse.count({ where: { garageId: garage.id, createdAt: { gte: monthStart(new Date()) } } })
    const decision = leadDecision(garage, usedThisMonth)
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "You've used this month's leads for your plan. Buy lead credits or upgrade to answer more.", code: "LEAD_LIMIT" },
        { status: 402 }
      )
    }
    const spentCredit = decision.useCredit && (await spendLeadCredit(garage.id, jobRequest.id))
    if (decision.useCredit && !spentCredit) {
      return NextResponse.json({ error: "You're out of lead credits. Buy more to answer this lead.", code: "LEAD_LIMIT" }, { status: 402 })
    }

    let jobResponse
    try {
      jobResponse = await prisma.jobResponse.create({
        data: {
          jobRequestId: jobRequest.id,
          garageId: garage.id,
          price: lines.total,
          source: "MANUAL",
          lineItems: JSON.stringify(lines.items),
          laborCost: data.laborCost,
          partsCost: data.partsCost,
          message: data.message,
          validUntil,
          status: "SENT",
        },
      })
    } catch (err) {
      if (spentCredit) await refundLeadCredit(garage.id, jobRequest.id).catch(() => {})
      throw err
    }

    // Running average of how quickly this garage answers, used to rank garages (see src/lib/ranking.ts).
    const mins = Math.max(0, (jobResponse.createdAt.getTime() - jobRequest.createdAt.getTime()) / 60_000)
    await prisma.garage
      .update({
        where: { id: garage.id },
        data: {
          avgResponseMins: ((garage.avgResponseMins ?? 0) * garage.responseSamples + mins) / (garage.responseSamples + 1),
          responseSamples: { increment: 1 },
        },
      })
      .catch(() => {})

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
