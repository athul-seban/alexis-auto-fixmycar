import { z } from "zod"
import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { findMatchingJobRequestsForGarage } from "@/lib/job-matching"
import { normaliseVrm } from "@/lib/portal/vrm"
import { redactForGarage } from "@/lib/portal/redact"
import { parseLineItems, parseWorks, type LineItem } from "@/lib/portal/quote-pricing"
import { expireDueRequests } from "@/lib/portal/quote-request-service"

// One inbox over the two ways a customer asks a garage for a price:
//  - QUOTE: a logged-in owner requested a quote from this garage specifically.
//  - JOB:   a guest posted a job; matching garages may respond with a price.
// Both feed the same stages so the garage can work a single list.

export type EnquiryKind = "QUOTE" | "JOB"
export type EnquiryStage = "new" | "estimates" | "closed" | "all"
export const STAGES: EnquiryStage[] = ["new", "estimates", "closed", "all"]

export interface EnquiryRow {
  key: string
  kind: EnquiryKind
  id: string
  stage: Exclude<EnquiryStage, "all">
  /** Human state: PENDING/SENT/ACCEPTED/REJECTED/EXPIRED for quotes; NEW/SENT/ACCEPTED/DECLINED/IGNORED for jobs. */
  status: string
  serviceType: string
  /** Every work requested (serviceType is the first). */
  works: string[]
  /** Deadline for sending a quote by hand; null when the garage has already answered or there is none. */
  respondBy: string | null
  /** MANUAL, or AUTO / ESTIMATE when the platform sent the garage's own price. */
  source: string
  lineItems: LineItem[]
  /** The garage's own fixed price per work, to prefill a manual quote. */
  suggestedPrices: Record<string, number>
  description: string
  vehicle: { vrm: string | null; make: string; model: string; year: number }
  customer: { name: string | null; phone: string | null }
  location: { city: string; postcode: string } | null
  /** False until the customer accepts: name, phone, full registration and full postcode are withheld. */
  detailsShared: boolean
  preferredDate: string | null
  myPrice: number | null
  laborCost: number | null
  partsCost: number | null
  note: string | null
  validUntil: string | null
  /** JobResponse id for JOB rows the garage has priced. */
  responseId: string | null
  bookingId: string | null
  canBook: boolean
  canMessage: boolean
  contacted: boolean
  ignored: boolean
  createdAt: string
}

export interface EnquiriesResult {
  enquiries: EnquiryRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: Record<EnquiryStage, number>
}

export const enquiriesQuerySchema = z.object({
  stage: z.enum(["new", "estimates", "closed", "all"]).default("new"),
  kind: z.enum(["QUOTE", "JOB"]).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50].includes(n), "Unsupported page size").default(25),
})
export type EnquiriesQuery = z.infer<typeof enquiriesQuerySchema>

const FETCH_CAP = 500
const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function listEnquiries(garage: Garage, q: EnquiriesQuery): Promise<EnquiriesResult> {
  const live = garage.status === "APPROVED"
  // Close (or estimate) any request whose deadline has passed before listing, so nothing stale shows as awaiting a quote.
  await expireDueRequests({ garageId: garage.id })

  const priceRows = await prisma.servicePrice.findMany({ where: { garageId: garage.id, isActive: true, fixedPrice: { not: null } }, select: { serviceType: true, fixedPrice: true } })
  const suggested: Record<string, number> = Object.fromEntries(priceRows.map((p) => [p.serviceType, p.fixedPrice as number]))

  const [quotes, responses, openJobs, leads] = await Promise.all([
    prisma.quote.findMany({
      where: { garageId: garage.id },
      include: {
        vehicle: { select: { registration: true, make: true, model: true, year: true } },
        owner: { select: { name: true, phone: true } },
        booking: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: FETCH_CAP,
    }),
    prisma.jobResponse.findMany({
      where: { garageId: garage.id },
      include: { jobRequest: true, booking: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: FETCH_CAP,
    }),
    // Marketplace leads are only for live garages.
    live ? findMatchingJobRequestsForGarage(garage) : Promise.resolve([]),
    prisma.garageLead.findMany({ where: { garageId: garage.id } }),
  ])
  const leadByJob = new Map(leads.map((l) => [l.jobRequestId, l]))

  const rows: EnquiryRow[] = []

  for (const quote of quotes) {
    const stage: EnquiryRow["stage"] = quote.status === "PENDING" ? "new" : quote.status === "SENT" ? "estimates" : "closed"
    rows.push({
      key: `QUOTE:${quote.id}`,
      kind: "QUOTE",
      id: quote.id,
      stage,
      status: quote.status,
      serviceType: quote.serviceType,
      works: parseWorks(quote.services, quote.serviceType),
      respondBy: quote.status === "PENDING" ? iso(quote.respondBy) : null,
      source: quote.source,
      lineItems: parseLineItems(quote.lineItems),
      suggestedPrices: suggested,
      description: quote.description,
      ...redactForGarage(
        {
          vehicle: { vrm: normaliseVrm(quote.vehicle.registration) || null, make: quote.vehicle.make, model: quote.vehicle.model, year: quote.vehicle.year },
          customer: { name: quote.owner.name, phone: quote.owner.phone },
          location: null,
        },
        quote.booking !== null
      ),
      preferredDate: null,
      myPrice: quote.price,
      laborCost: quote.laborCost,
      partsCost: quote.partsCost,
      note: quote.notes,
      validUntil: iso(quote.validUntil),
      responseId: null,
      bookingId: quote.booking?.id ?? null,
      canBook: false, // only the customer accepts a quote
      canMessage: true,
      contacted: quote.contactedAt !== null,
      ignored: quote.status === "REJECTED",
      createdAt: quote.createdAt.toISOString(),
    })
  }

  const jobRow = (
    job: (typeof responses)[number]["jobRequest"],
    response: (typeof responses)[number] | null
  ): EnquiryRow => {
    const lead = leadByJob.get(job.id)
    const ignored = lead?.status === "IGNORED"
    let stage: EnquiryRow["stage"]
    let status: string
    if (response) {
      stage = response.status === "SENT" ? "estimates" : "closed"
      status = response.status
    } else {
      stage = ignored ? "closed" : "new"
      status = ignored ? "IGNORED" : "NEW"
    }
    return {
      key: `JOB:${job.id}`,
      kind: "JOB",
      id: job.id,
      stage,
      status,
      serviceType: job.serviceType,
      works: parseWorks(job.services, job.serviceType),
      respondBy: response ? null : iso(job.respondBy),
      source: response?.source ?? "MANUAL",
      lineItems: parseLineItems(response?.lineItems),
      suggestedPrices: suggested,
      description: job.description,
      ...redactForGarage(
        {
          vehicle: { vrm: normaliseVrm(job.registration) || null, make: job.make, model: job.model, year: job.year },
          customer: { name: job.guestName, phone: job.guestPhone },
          location: { city: job.city, postcode: job.postcode },
        },
        response?.booking != null
      ),
      preferredDate: iso(job.preferredDate),
      myPrice: response?.price ?? null,
      laborCost: response?.laborCost ?? null,
      partsCost: response?.partsCost ?? null,
      note: response?.message ?? null,
      validUntil: iso(response?.validUntil ?? null),
      responseId: response?.id ?? null,
      bookingId: response?.booking?.id ?? null,
      canBook: false, // only the customer accepts a quote
      canMessage: false, // guests have no account to message
      contacted: !!lead?.contactedAt,
      ignored,
      createdAt: job.createdAt.toISOString(),
    }
  }

  const seenJobs = new Set<string>()
  for (const r of responses) {
    seenJobs.add(r.jobRequestId)
    rows.push(jobRow(r.jobRequest, r))
  }
  for (const job of openJobs) {
    if (seenJobs.has(job.id)) continue
    seenJobs.add(job.id)
    rows.push(jobRow(job, null))
  }

  const counts: Record<EnquiryStage, number> = { new: 0, estimates: 0, closed: 0, all: rows.length }
  for (const r of rows) counts[r.stage] += 1

  const needle = q.q?.trim().toLowerCase()
  const filtered = rows
    .filter((r) => (q.stage === "all" ? true : r.stage === q.stage))
    .filter((r) => (q.kind ? r.kind === q.kind : true))
    .filter((r) => {
      if (!needle) return true
      const hay = `${r.customer.name ?? ""} ${r.vehicle.vrm ?? ""} ${r.vehicle.make} ${r.vehicle.model} ${r.description}`.toLowerCase()
      return hay.includes(needle) || (r.vehicle.vrm ?? "").toLowerCase().includes(normaliseVrm(needle).toLowerCase())
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const total = filtered.length
  const start = (q.page - 1) * q.pageSize
  return {
    enquiries: filtered.slice(start, start + q.pageSize),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    counts,
  }
}

/**
 * How many enquiries are waiting for a first response (the "new" stage). Same rules as
 * listEnquiries, without building rows — used by the dashboard.
 */
export async function countNewEnquiries(garage: Garage): Promise<number> {
  await expireDueRequests({ garageId: garage.id })
  const [pendingQuotes, ignored, matched] = await Promise.all([
    prisma.quote.count({ where: { garageId: garage.id, status: "PENDING" } }),
    prisma.garageLead.findMany({ where: { garageId: garage.id, status: "IGNORED" }, select: { jobRequestId: true } }),
    garage.status === "APPROVED" ? findMatchingJobRequestsForGarage(garage) : Promise.resolve([]),
  ])
  const ignoredIds = new Set(ignored.map((l) => l.jobRequestId))
  const newJobs = matched.filter((j) => j.responses.length === 0 && !ignoredIds.has(j.id)).length
  return pendingQuotes + newJobs
}

/** Does the garage have any access to this job (a response of its own, or a live match)? */
export async function garageCanSeeJob(garage: Garage, jobRequestId: string): Promise<boolean> {
  const mine = await prisma.jobResponse.findUnique({
    where: { jobRequestId_garageId: { jobRequestId, garageId: garage.id } },
    select: { id: true },
  })
  if (mine) return true
  if (garage.status !== "APPROVED") return false
  const matches = await findMatchingJobRequestsForGarage(garage)
  return matches.some((j) => j.id === jobRequestId)
}
