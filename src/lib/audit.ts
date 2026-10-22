import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"

export type AuditAction =
  | "GARAGE_APPROVED"
  | "GARAGE_REJECTED"
  | "GARAGE_SUSPENDED"
  | "GARAGE_BADGES"
  | "USER_ROLE"
  | "USER_SUSPENDED"
  | "USER_REINSTATED"
  | "USER_RESET"
  | "USER_DELETED"
  | "REVIEW_DELETED"
  | "REVIEW_DISPUTE_UPHELD"
  | "REVIEW_DISPUTE_REJECTED"
  | "DOCUMENT_APPROVED"
  | "DOCUMENT_REJECTED"
  | "SUPPORT_VIEW"
  | "CONTENT_PUBLISHED"
  | "CONTENT_RESET"
  | "SETTING_UPDATED"
  | "SETTING_CLEARED"
  | "SETTING_TESTED"
  | "GARAGE_INVITED"
  | "GARAGE_INVITE_RESENT"
  // inside a garage business (the business's own people), recorded with its organisationId
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  | "ROLE_ENABLED"
  | "ROLE_DISABLED"
  | "STAFF_INVITED"
  | "STAFF_INVITE_REVOKED"
  | "STAFF_JOINED"
  | "STAFF_ACCESS_CHANGED"
  | "STAFF_SUSPENDED"
  | "STAFF_REINSTATED"
  | "STAFF_REMOVED"
  | "LOCATION_ADDED"
  | "LOCATION_UPDATED"
  | "LOCATION_ARCHIVED"
  | "LOCATION_RESTORED"
  | "BUSINESS_UPDATED"
  // the business's website
  | "SITE_ADDRESS_CHANGED"
  | "SITE_SUBMITTED"
  | "SITE_PUBLISHED"
  | "SITE_UNPUBLISHED"
  | "SITE_ROLLED_BACK"
  // a platform admin's decisions about a website, filed under the business too
  | "SITE_APPROVED"
  | "SITE_REJECTED"
  | "SITE_DISABLED"
  | "SITE_ENABLED"

export type AuditTarget = "GARAGE" | "USER" | "REVIEW" | "DOCUMENT" | "CONTENT" | "SETTING" | "ROLE" | "MEMBER" | "LOCATION" | "ORGANISATION" | "SITE"

/** Who did it: a NextAuth session, or just an id and email (a service that only has the signed-in user's context). */
export type AuditActor = Session | { user?: { id?: string; email?: string | null } } | null

/**
 * Record an action. Never throws: an audit write failing must not undo or block the change that was just
 * made (the error is logged instead). `organisationId` files the entry under a garage business so it can see its own trail.
 */
export async function audit(
  session: AuditActor,
  e: { action: AuditAction; targetType: AuditTarget; targetId: string; detail?: string | null; organisationId?: string | null }
): Promise<void> {
  const user = session?.user as { id?: string; email?: string | null } | undefined
  try {
    await prisma.auditLog.create({
      data: {
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        detail: e.detail ?? null,
        organisationId: e.organisationId ?? null,
      },
    })
  } catch (err) {
    console.error("[audit] failed to record", e.action, err)
  }
}
