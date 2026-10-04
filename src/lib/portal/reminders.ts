import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { bookingReminderEmail } from "@/lib/email-templates"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { vehicleLabel } from "@/lib/portal/booking-service"
import { manageUrl } from "@/lib/portal/links"
import { notifyBookingOwner } from "@/lib/portal/booking-service"
import { formatLondonDateTime } from "@/lib/portal/tz"

const HOUR_MS = 3_600_000

/**
 * Email every customer whose confirmed appointment starts within the next 24 hours, once. The `reminderSentAt`
 * claim is a compare-and-set so overlapping cron runs (or a retry) can't send the same reminder twice.
 */
export async function sendDueBookingReminders(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      timeConfirmed: true,
      reminderSentAt: null,
      customerEmail: { not: null },
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR_MS) },
    },
    include: { garage: { select: { name: true, phone: true, address: true, city: true, postcode: true } } },
    take: 200,
  })

  let sent = 0
  let skipped = 0
  for (const b of due) {
    const claim = await prisma.booking.updateMany({ where: { id: b.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (claim.count === 0) {
      skipped++
      continue
    }
    try {
      await sendMail({
        to: b.customerEmail!,
        ...bookingReminderEmail({
          garage: b.garage,
          customerName: b.customerName,
          serviceType: b.serviceType,
          whenLabel: formatLondonDateTime(b.scheduledAt),
          vehicle: vehicleLabel(b),
          manageHref: manageUrl(b.manageToken),
        }),
      })
      await notifyBookingOwner(b, { type: "BOOKING_REMINDER", title: "Appointment tomorrow", body: `${b.garage.name} · ${formatLondonDateTime(b.scheduledAt)}` })
      await recordBookingEvent(prisma, { bookingId: b.id, actorType: "SYSTEM", type: "REMINDER", detail: "Reminder email sent" })
      sent++
    } catch (err) {
      // Release the claim so the next run retries a failed send.
      await prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: null } })
      console.error("[reminders] failed for booking", b.id, err)
      skipped++
    }
  }
  return { sent, skipped }
}
