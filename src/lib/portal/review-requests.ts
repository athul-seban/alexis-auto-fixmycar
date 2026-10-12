import { prisma } from "@/lib/prisma"
import { sendReviewRequestEmail } from "@/lib/portal/customer-email"
import { notifyCustomerSms } from "@/lib/portal/sms-notify"
import { parsePortalSettings } from "@/lib/portal/portal-settings"

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Wait a day so the customer has the car back, and stop asking after two weeks (a late ask feels odd). */
const MIN_AGE_MS = 24 * HOUR_MS
const MAX_AGE_MS = 14 * DAY_MS

/**
 * Ask customers for a review once, a day or more after a job is completed. Every completed customer is asked: no
 * filtering by how the job went. The `reviewRequestedAt` claim makes overlapping runs safe, and is released on a
 * failed send so the next run retries. Garages can switch it off in Settings; unsubscribed addresses are skipped.
 */
export async function sendDueReviewRequests(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const due = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      reviewRequestedAt: null,
      customerEmail: { not: null },
      manageToken: { not: null },
      review: null,
      completedAt: { gte: new Date(now.getTime() - MAX_AGE_MS), lte: new Date(now.getTime() - MIN_AGE_MS) },
      garage: { status: "APPROVED" },
    },
    include: { garage: { select: { portalSettings: true } } },
    orderBy: { completedAt: "asc" },
    take: 200,
  })

  let sent = 0
  let skipped = 0
  const askedThisRun = new Set<string>() // one email per customer per garage per run
  for (const b of due) {
    const key = `${b.garageId}|${b.customerEmail!.toLowerCase()}`
    const settings = parsePortalSettings(b.garage.portalSettings)
    // Permanent skips keep the claim so the booking isn't rescanned every run.
    if (!settings.notifications.reviewRequests || askedThisRun.has(key)) {
      await prisma.booking.updateMany({ where: { id: b.id, reviewRequestedAt: null }, data: { reviewRequestedAt: now } })
      skipped++
      continue
    }
    const claim = await prisma.booking.updateMany({ where: { id: b.id, reviewRequestedAt: null }, data: { reviewRequestedAt: now } })
    if (claim.count === 0) {
      skipped++
      continue
    }
    try {
      const outcome = await sendReviewRequestEmail(b.id)
      if (outcome === "failed") throw new Error("email send failed")
      if (outcome === "sent") {
        askedThisRun.add(key)
        sent++
        await notifyCustomerSms(b.id, "REVIEW_REQUEST", now)
      } else {
        skipped++
      }
    } catch (err) {
      await prisma.booking.update({ where: { id: b.id }, data: { reviewRequestedAt: null } })
      console.error("[review-requests] failed for booking", b.id, err)
      skipped++
    }
  }
  return { sent, skipped }
}
