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

export type AuditTarget = "GARAGE" | "USER" | "REVIEW" | "DOCUMENT"

/**
 * Record an admin action. Never throws: an audit write failing must not undo or block the change that was just
 * made (the error is logged instead).
 */
export async function audit(
  session: Session | null,
  e: { action: AuditAction; targetType: AuditTarget; targetId: string; detail?: string | null }
): Promise<void> {
  const user = session?.user as { id?: string; email?: string | null } | undefined
  try {
    await prisma.auditLog.create({
      data: { actorId: user?.id ?? null, actorEmail: user?.email ?? null, action: e.action, targetType: e.targetType, targetId: e.targetId, detail: e.detail ?? null },
    })
  } catch (err) {
    console.error("[audit] failed to record", e.action, err)
  }
}
