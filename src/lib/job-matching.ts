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
