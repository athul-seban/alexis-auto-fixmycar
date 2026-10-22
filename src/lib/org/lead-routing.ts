import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { outwardPostcode } from "@/lib/portal/redact"

// One lead per business. A business can have several locations that all match a customer's job (same city, a nearby
// postcode). Each location is its own marketplace listing, but the BUSINESS should hear about the job once, be able to
// answer it once, and be charged once. So among a business's matching locations exactly one WINS the job: the closest
// by postcode, then the best rated, then the lowest id (so it is the same answer every time, everywhere it is asked).
//
// Job requests carry only a city and postcode as text (no coordinates), so "closest" is a ranking of how much of the
// postcode agrees, not a distance. Geocoding could refine it later without changing anything that calls this.

export interface RoutableGarage {
  id: string
  organisationId: string | null
  city: string
  postcode: string
  averageRating: number
}

interface JobPlace {
  city: string
  postcode: string
}

/** Locations of different businesses never compete with each other; a garage with no business is its own business. */
export const businessKey = (g: Pick<RoutableGarage, "id" | "organisationId">): string => g.organisationId ?? `garage:${g.id}`

/** 0 = same postcode district, 1 = same area (first 3 characters), 2 = same city, 3 = none of those. */
export function locationTier(job: JobPlace, g: Pick<RoutableGarage, "city" | "postcode">): 0 | 1 | 2 | 3 {
  const jobOutward = outwardPostcode(job.postcode)
  const gOutward = outwardPostcode(g.postcode)
  if (jobOutward && jobOutward === gOutward) return 0
  if (job.postcode.toUpperCase().replace(/\s+/g, "").startsWith(g.postcode.toUpperCase().replace(/\s+/g, "").slice(0, 3))) return 1
  if (job.city.toLowerCase().includes(g.city.toLowerCase())) return 2
  return 3
}

/** The location that should handle this job, or null if there are no candidates. Deterministic. */
export function pickLocation<G extends RoutableGarage>(job: JobPlace, candidates: readonly G[]): G | null {
  let best: G | null = null
  for (const g of candidates) {
    if (!best) {
      best = g
      continue
    }
    const a = locationTier(job, g)
    const b = locationTier(job, best)
    if (a !== b ? a < b : g.averageRating !== best.averageRating ? g.averageRating > best.averageRating : g.id < best.id) best = g
  }
  return best
}

/** Keeps one location per business (the winner), preserving the original order of the winners. */
export function dedupeByBusiness<G extends RoutableGarage>(job: JobPlace, garages: readonly G[]): G[] {
  const winners = new Map<string, G>()
  const groups = new Map<string, G[]>()
  for (const g of garages) groups.set(businessKey(g), [...(groups.get(businessKey(g)) ?? []), g])
  for (const [key, group] of groups) winners.set(key, pickLocation(job, group)!)
  const winnerIds = new Set([...winners.values()].map((w) => w.id))
  return garages.filter((g) => winnerIds.has(g.id))
}

// ---- database-aware checks -----------------------------------------------------------------------------------------

/** The other approved locations of a garage's business (including itself). Just the garage itself when it has no business. */
export async function approvedSiblings(garage: Pick<Garage, "id" | "organisationId">): Promise<Garage[]> {
  if (!garage.organisationId) return []
  return prisma.garage.findMany({ where: { organisationId: garage.organisationId, status: "APPROVED" } })
}

export type AnswerCheck = { ok: true } | { ok: false; reason: "BUSINESS_ANSWERED" | "NEARER_LOCATION"; message: string }

/**
 * May this location answer this job as far as its BUSINESS is concerned? (Whether the job suits the location at all,
 * the area and services, is job-matching's question.) No if another location of the business has already answered, or if
 * another matching location is the one that should handle it. Jobs aimed at one garage by name are never deduplicated.
 *
 * `matches(sibling)` says whether a sibling location is a candidate for this job at all (area, services, mobile).
 */
export async function canBusinessAnswer(
  job: JobPlace & { id: string; targetGarageId?: string | null },
  garage: Garage,
  matches: (g: Garage) => boolean
): Promise<AnswerCheck> {
  if (job.targetGarageId) return { ok: true }
  const siblings = await approvedSiblings(garage)
  if (siblings.length <= 1) return { ok: true }

  const answered = await prisma.jobResponse.findFirst({ where: { jobRequestId: job.id, garageId: { in: siblings.map((s) => s.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { garageId: true } })
  if (answered) {
    return answered.garageId === garage.id ? { ok: true } : { ok: false, reason: "BUSINESS_ANSWERED", message: "Another location of your business has already answered this request." }
  }
  const winner = pickLocation(job, siblings.filter(matches))
  if (winner && winner.id !== garage.id) {
    return { ok: false, reason: "NEARER_LOCATION", message: "This request is handled by another of your locations, the closest one to the customer." }
  }
  return { ok: true }
}

/**
 * After saving a response: did THIS location's answer win, if several locations of the business answered at the same
 * moment? The earliest response wins (ties by id), so every location reaches the same verdict.
 */
export async function wonTheLead(jobRequestId: string, garage: Pick<Garage, "id" | "organisationId">): Promise<boolean> {
  if (!garage.organisationId) return true
  const siblings = await prisma.garage.findMany({ where: { organisationId: garage.organisationId }, select: { id: true } })
  if (siblings.length <= 1) return true
  const first = await prisma.jobResponse.findFirst({ where: { jobRequestId, garageId: { in: siblings.map((s) => s.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { garageId: true } })
  return !first || first.garageId === garage.id
}
