import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { bookingStatusCustomerEmail, reviewRequestEmail } from "@/lib/email-templates"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { manageUrl } from "@/lib/portal/links"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { canEmailMarketing, unsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe"

export type CustomerEmailKind = "CONFIRMED" | "CANCELLED" | "RESCHEDULED" | "CANCELLED_BY_YOU"

const vehicleText = (b: { vehicleMake: string | null; vehicleModel: string | null; vrm: string | null }) =>
  [b.vehicleMake, b.vehicleModel, b.vrm ? `(${b.vrm})` : ""].filter(Boolean).join(" ")

/**
 * Tell the customer about a change to their booking. Transactional (they asked for the booking), so it ignores
 * marketing suppression, but the garage can switch it off in Settings. Never throws and never blocks the change;
 * the outcome goes into the booking history.
 */
export async function emailCustomerAboutBooking(
  bookingId: string,
  kind: CustomerEmailKind,
  opts: { previousScheduledAt?: Date; refundNote?: string | null } = {}
): Promise<boolean> {
  try {
    const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { garage: true, owner: { select: { emailNotifications: true } } } })
    if (!b?.customerEmail) return false
    if (!parsePortalSettings(b.garage.portalSettings).notifications.customerEmails) return false
    // Account holders who turned email off still hear about cancellations and moves (they need to act), not a plain confirmation.
    if (kind === "CONFIRMED" && b.owner && !b.owner.emailNotifications) return false

    const result = await sendMail({
      to: b.customerEmail,
      ...bookingStatusCustomerEmail({
        kind,
        garage: b.garage,
        customerName: b.customerName,
        serviceType: b.serviceType,
        whenLabel: formatLondonDateTime(b.scheduledAt),
        previousWhenLabel: opts.previousScheduledAt ? formatLondonDateTime(opts.previousScheduledAt) : null,
        vehicle: vehicleText(b),
        reason: b.cancelReason,
        refundNote: opts.refundNote ?? null,
        timeConfirmed: b.timeConfirmed,
        manageHref: manageUrl(b.manageToken),
      }),
    })
    if (result?.success === false) throw new Error("send failed")
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "EMAIL", detail: `Emailed customer: ${kind.toLowerCase().replace(/_/g, " ")}` })
    return true
  } catch (err) {
    console.error("[customer-email]", err)
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "EMAIL", detail: `Customer email failed: ${kind.toLowerCase().replace(/_/g, " ")}` }).catch(() => {})
    return false
  }
}

/** The "how did we do?" email. Marketing-adjacent, so it honours unsubscribes and carries an unsubscribe link. */
export async function sendReviewRequestEmail(bookingId: string): Promise<"sent" | "skipped" | "failed"> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { garage: true } })
  if (!b?.customerEmail || !b.manageToken) return "skipped"
  if (!(await canEmailMarketing(b.customerEmail, b.garageId))) return "skipped"

  const result = await sendMail({
    to: b.customerEmail,
    headers: unsubscribeHeaders(b.customerEmail, b.garageId),
    ...reviewRequestEmail({
      garage: b.garage,
      customerName: b.customerName,
      serviceType: b.serviceType,
      reviewHref: `${manageUrl(b.manageToken)}?review=1`,
      unsubscribeHref: unsubscribeUrl(b.customerEmail, b.garageId),
    }),
  })
  if (result?.success === false) return "failed"
  await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "REVIEW", detail: "Review request emailed" })
  return "sent"
}
