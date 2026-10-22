import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"
import { ALL_LOCATIONS } from "@/lib/org/access"

// "Who owns this garage?" used to be Garage.user. A location no longer has a login of its own, so the answer is the
// business's Owner (a member holding the Owner role at all locations), falling back to the legacy login.

export interface OwnerSummary {
  id: string
  name: string | null
  email: string
  phone: string | null
  /** True until they have set a password from their invitation email. */
  invitePending: boolean
}

const USER_FIELDS = { id: true, name: true, email: true, phone: true, password: true } as const

/** Add to a Garage query's `select`/`include` to carry what pickOwner needs. */
export const OWNER_SELECT = {
  user: { select: USER_FIELDS },
  organisation: {
    select: {
      memberships: {
        where: { status: "ACTIVE", assignments: { some: { scopeKey: ALL_LOCATIONS, role: { presetKey: OWNER_ROLE_KEY, isSystem: true } } } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { user: { select: USER_FIELDS } },
      },
    },
  },
} satisfies Prisma.GarageSelect

type WithOwner = Prisma.GarageGetPayload<{ select: typeof OWNER_SELECT }>

const summarise = (u: { id: string; name: string | null; email: string; phone: string | null; password: string | null }): OwnerSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  invitePending: !u.password,
})

/** The business's Owner, else the garage's legacy login, else null. */
export function pickOwner(g: WithOwner): OwnerSummary | null {
  const owner = g.organisation?.memberships[0]?.user ?? g.user
  return owner ? summarise(owner) : null
}

export async function ownerOfGarage(garageId: string): Promise<OwnerSummary | null> {
  const g = await prisma.garage.findUnique({ where: { id: garageId }, select: OWNER_SELECT })
  return g ? pickOwner(g) : null
}
