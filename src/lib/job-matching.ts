import { prisma } from "@/lib/prisma"
import { parseServiceList } from "@/lib/garage-mapper"
import { MAX_MATCHED_GARAGES } from "@/lib/constants"
import type { Garage, JobRequest } from "@prisma/client"

interface MatchGaragesParams {
  city: string
  postcode: string
  serviceType: string
  mobileOnly?: boolean
}

export async function findMatchingGaragesForJob({
  city,
  postcode,
  serviceType,
  mobileOnly,
}: MatchGaragesParams): Promise<Garage[]> {
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

  return candidates
    .filter((g) => (parseServiceList(g.services) as string[]).includes(serviceType))
    .filter((g) => (mobileOnly ? g.isMobile : true))
    .slice(0, MAX_MATCHED_GARAGES)
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
  job: { city: string; postcode: string; serviceType: string; isMobilePreferred: boolean },
  garage: { city: string; postcode: string; services: string; isMobile: boolean }
): boolean {
  const cityMatch = job.city.toLowerCase().includes(garage.city.toLowerCase())
  const postcodeMatch = job.postcode.toUpperCase().startsWith(garage.postcode.slice(0, 3).toUpperCase())
  const servicesMatch = (parseServiceList(garage.services) as string[]).includes(job.serviceType)
  const mobileMatch = job.isMobilePreferred ? garage.isMobile : true
  return (cityMatch || postcodeMatch) && servicesMatch && mobileMatch
}

// A garage may see who to call, but never the guest's tracking token (it authorises
// accepting a quote on the guest's behalf) or their email.
export function toGarageJobView<T extends { token: string; guestEmail: string }>(
  job: T
): Omit<T, "token" | "guestEmail"> {
  const { token: _token, guestEmail: _guestEmail, ...safe } = job
  void _token
  void _guestEmail
  return safe
}

export async function findMatchingJobRequestsForGarage(
  garage: Garage
): Promise<JobRequestWithResponses[]> {
  const jobs = await prisma.jobRequest.findMany({
    where: {
      status: { in: ["OPEN", "QUOTED"] },
      OR: [
        { city: { contains: garage.city } },
        { postcode: { startsWith: garage.postcode.slice(0, 3).toUpperCase() } },
      ],
    },
    include: {
      responses: { where: { garageId: garage.id } },
    },
    orderBy: { createdAt: "desc" },
  })

  return jobs.filter((job) => {
    const servicesMatch = (parseServiceList(garage.services) as string[]).includes(job.serviceType)
    const mobileMatch = job.isMobilePreferred ? garage.isMobile : true
    return servicesMatch && mobileMatch
  })
}
