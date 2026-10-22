import { prisma } from "@/lib/prisma"
import { outwardPostcode } from "@/lib/portal/redact"
import { parseServiceList } from "@/lib/garage-mapper"
import { MAX_MATCHED_GARAGES } from "@/lib/constants"
import { approvedSiblings, dedupeByBusiness, pickLocation } from "@/lib/org/lead-routing"
import type { Garage, JobRequest } from "@prisma/client"

interface MatchGaragesParams {
  city: string
  postcode: string
  serviceType: string
  mobileOnly?: boolean
  /** The customer asked one specific garage: only that garage is matched, wherever it is. */
  targetGarageId?: string | null
}

export async function findMatchingGaragesForJob({
  city,
  postcode,
  serviceType,
  mobileOnly,
  targetGarageId,
}: MatchGaragesParams): Promise<Garage[]> {
  if (targetGarageId) {
    const target = await prisma.garage.findFirst({ where: { id: targetGarageId, status: "APPROVED" } })
    return target && (parseServiceList(target.services) as string[]).includes(serviceType) ? [target] : []
  }
  const candidates = await prisma.garage.findMany({
    where: {
      status: "APPROVED",
      OR: [
        { city: { contains: city } },
        { postcode: { startsWith: postcode.slice(0, 3).toUpperCase() } },
      ],
    },
    orderBy: { averageRating: "desc" },
  })

  const matching = candidates
    .filter((g) => (parseServiceList(g.services) as string[]).includes(serviceType))
    .filter((g) => (mobileOnly ? g.isMobile : true))
  // One lead per business: a business with several matching locations is told once, about the location that should
  // handle it, and the cap on how many garages hear about a job counts businesses, not locations.
  return dedupeByBusiness({ city, postcode }, matching).slice(0, MAX_MATCHED_GARAGES)
}

type JobRequestWithResponses = JobRequest & {
  responses: { id: string; garageId: string; price: number; status: string; createdAt: Date }[]
}

/**
 * Pure counterpart of the DB match in findMatchingJobRequestsForGarage: does this open job fall
 * in the garage's area (city contains, case-insensitive, or postcode prefix), services and
 * mobile preference? Used to authorise a garage responding to a job it was never matched with.
 */
export function jobMatchesGarage(
  job: { city: string; postcode: string; serviceType: string; isMobilePreferred: boolean; targetGarageId?: string | null },
  garage: { id?: string; city: string; postcode: string; services: string; isMobile: boolean }
): boolean {
  const servicesOffered = (parseServiceList(garage.services) as string[]).includes(job.serviceType)
  // A job aimed at one garage belongs to that garage alone, and other garages never see it.
  if (job.targetGarageId) return garage.id === job.targetGarageId && servicesOffered
  const cityMatch = job.city.toLowerCase().includes(garage.city.toLowerCase())
  const postcodeMatch = job.postcode.toUpperCase().startsWith(garage.postcode.slice(0, 3).toUpperCase())
  const servicesMatch = servicesOffered
  const mobileMatch = job.isMobilePreferred ? garage.isMobile : true
  return (cityMatch || postcodeMatch) && servicesMatch && mobileMatch
}

// A garage never sees the guest's tracking token (it authorises accepting a quote on the guest's behalf), nor their
// name, phone, email or full registration/postcode, until the customer accepts a quote (src/lib/portal/redact.ts).
export function toGarageJobView<T extends { token: string; guestEmail: string; guestName: string; guestPhone: string; registration: string; postcode: string }>(
  job: T
): Omit<T, "token" | "guestEmail" | "guestName" | "guestPhone" | "registration"> {
  const { token: _t, guestEmail: _e, guestName: _n, guestPhone: _p, registration: _r, postcode, ...safe } = job
  void _t, _e, _n, _p, _r
  return { ...safe, postcode: outwardPostcode(postcode) } as unknown as Omit<T, "token" | "guestEmail" | "guestName" | "guestPhone" | "registration">
}

export async function findMatchingJobRequestsForGarage(
  garage: Garage
): Promise<JobRequestWithResponses[]> {
  const jobs = await prisma.jobRequest.findMany({
    where: {
      status: { in: ["OPEN", "QUOTED"] },
      OR: [
        // Asked of this garage by name…
        { targetGarageId: garage.id },
        // …or sent to everyone in the area (a job aimed at another garage is not ours).
        {
          targetGarageId: null,
          OR: [
            { city: { contains: garage.city } },
            { postcode: { startsWith: garage.postcode.slice(0, 3).toUpperCase() } },
          ],
        },
      ],
    },
    include: {
      responses: { where: { garageId: garage.id } },
    },
    orderBy: { createdAt: "desc" },
  })

  const mine = jobs.filter((job) => {
    const servicesMatch = (parseServiceList(garage.services) as string[]).includes(job.serviceType)
    // The customer chose this garage, so their mobile preference doesn't exclude it.
    const mobileMatch = job.targetGarageId || !job.isMobilePreferred ? true : garage.isMobile
    return servicesMatch && mobileMatch
  })

  // One lead per business: of a business's matching locations only the one that should handle a job lists it, and once
  // any location has answered the others stop listing it. A location that already answered keeps seeing its own job.
  if (garage.status !== "APPROVED") return mine
  const siblings = await approvedSiblings(garage)
  if (siblings.length <= 1) return mine

  const open = mine.filter((j) => !j.targetGarageId && j.responses.length === 0)
  const answers = await prisma.jobResponse.findMany({ where: { jobRequestId: { in: open.map((j) => j.id) }, garageId: { in: siblings.map((s) => s.id) } }, select: { jobRequestId: true } })
  const answered = new Set(answers.map((a) => a.jobRequestId))
  return mine.filter((job) => {
    if (job.targetGarageId || job.responses.length > 0) return true
    if (answered.has(job.id)) return false
    return pickLocation(job, siblings.filter((s) => jobMatchesGarage(job, s)))?.id === garage.id
  })
}
