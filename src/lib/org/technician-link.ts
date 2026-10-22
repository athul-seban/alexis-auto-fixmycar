import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ALL_LOCATIONS } from "@/lib/org/access"
import { OrgError } from "@/lib/org/org-error"

// Linking a technician (a row in the diary) to a login: the person then signs in and sees only the jobs assigned to that
// technician (see own-jobs.ts). The link names WHO the jobs belong to; what they may do is their role. Only people who
// really work at the location can be linked, so a technician can never be tied to a stranger's account.

export interface LocationPerson {
  id: string
  name: string | null
  email: string
}

/** Active, un-suspended people who can open this location. */
export async function peopleAtLocation(garage: Pick<Garage, "id" | "organisationId" | "userId">): Promise<LocationPerson[]> {
  if (!garage.organisationId) {
    if (!garage.userId) return []
    const owner = await prisma.user.findFirst({ where: { id: garage.userId, suspendedAt: null }, select: { id: true, name: true, email: true } })
    return owner ? [owner] : []
  }
  const members = await prisma.membership.findMany({
    where: {
      organisationId: garage.organisationId,
      status: "ACTIVE",
      user: { suspendedAt: null },
      assignments: { some: { scopeKey: { in: [garage.id, ALL_LOCATIONS] } } },
    },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  return members.map((m) => m.user).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
}

/**
 * Throws unless `userId` may be linked to a technician at this location: they must work here. Also refuses a person who
 * is already linked to a different technician here (a login is one technician at one location).
 */
export async function assertCanLink(garage: Pick<Garage, "id" | "organisationId" | "userId">, userId: string, technicianId: string): Promise<void> {
  const people = await peopleAtLocation(garage)
  if (!people.some((p) => p.id === userId)) throw new OrgError("INVALID_INPUT", "That person doesn't work at this location. Add them to your team first.")
  const other = await prisma.technician.findFirst({ where: { garageId: garage.id, userId, id: { not: technicianId } }, select: { name: true } })
  if (other) throw new OrgError("CONFLICT", `That person is already linked to ${other.name}.`)
}
