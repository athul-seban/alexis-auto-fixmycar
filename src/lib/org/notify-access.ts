import { prisma } from "@/lib/prisma"
import { ALL_LOCATIONS, canAny, computeAccess, type Access } from "@/lib/org/access"
import type { PermissionKey } from "@/lib/org/permissions"
import type { NotificationType } from "@/lib/notifications"

// Who is told about what. A location's notifications are shared by the people who work there, but not every person
// should see every kind: a receptionist shouldn't be pinged about billing, a technician not about reviews. Each
// notification type needs a permission, checked both when listing (the bell) and when pushing to devices.

/** What a member must hold at the location to see this kind of notification (any one of the keys). */
export const NOTIFICATION_PERMISSION: Record<NotificationType, readonly PermissionKey[]> = {
  BOOKING_CREATED: ["bookings.view"],
  BOOKING_STATUS_CHANGED: ["bookings.view"],
  BOOKING_REMINDER: ["bookings.view"],
  QUOTE_REQUESTED: ["enquiries.view"],
  QUOTE_RESPONDED: ["enquiries.view"],
  QUOTE_AUTO_SENT: ["enquiries.view"],
  QUOTE_EXPIRED: ["enquiries.view"],
  JOB_RESPONSE_RECEIVED: ["enquiries.view"],
  JOB_RESPONSE_ACCEPTED: ["enquiries.view"],
  MESSAGE_RECEIVED: ["messages.view"],
  REVIEW_RECEIVED: ["reviews.view"],
  REVIEW_REPLY: ["reviews.view"],
  // Listing status, documents verified, lead credits, featured placement: for whoever looks after the profile or billing.
  GARAGE_STATUS_CHANGED: ["profile.edit", "documents.manage", "billing.view", "website.edit"],
  VEHICLE_REMINDER: ["bookings.view"], // customer-facing; never sent to a garage
}

const KNOWN_TYPES = Object.keys(NOTIFICATION_PERMISSION) as NotificationType[]

/** May someone with this access see a notification of this type? Unknown types are hidden rather than shown to everyone. */
export function canSeeNotification(access: Pick<Access, "permissions">, type: string): boolean {
  const needs = NOTIFICATION_PERMISSION[type as NotificationType]
  return needs ? canAny(access, needs) : false
}

/** The notification types a member may see (for filtering the list and the unread count). */
export function visibleNotificationTypes(access: Pick<Access, "permissions">): NotificationType[] {
  return KNOWN_TYPES.filter((t) => canSeeNotification(access, t))
}

/**
 * The people to tell about a notification at a location: active members of its business who can open the location and
 * hold the right permission, never a suspended person or a suspended business. A garage with no business yet is told
 * through its one login. Returns user ids.
 */
export async function recipientsForLocation(garageId: string, type: NotificationType): Promise<string[]> {
  const garage = await prisma.garage.findUnique({ where: { id: garageId }, select: { id: true, userId: true, organisationId: true } })
  if (!garage) return []

  if (!garage.organisationId) {
    if (!garage.userId) return []
    const owner = await prisma.user.findUnique({ where: { id: garage.userId }, select: { suspendedAt: true } })
    return owner && !owner.suspendedAt ? [garage.userId] : []
  }

  const [org, roles, members] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: garage.organisationId }, select: { suspendedAt: true } }),
    prisma.role.findMany({ where: { organisationId: garage.organisationId }, select: { id: true, presetKey: true, isSystem: true, isEnabled: true, permissions: true } }),
    prisma.membership.findMany({
      where: {
        organisationId: garage.organisationId,
        status: "ACTIVE",
        user: { suspendedAt: null },
        assignments: { some: { scopeKey: { in: [garageId, ALL_LOCATIONS] } } },
      },
      select: { userId: true, assignments: { select: { roleId: true, scopeKey: true } } },
    }),
  ])
  if (!org || org.suspendedAt) return []

  const needs = NOTIFICATION_PERMISSION[type]
  return members.filter((m) => canAny(computeAccess(m.assignments, roles, garageId), needs)).map((m) => m.userId)
}
