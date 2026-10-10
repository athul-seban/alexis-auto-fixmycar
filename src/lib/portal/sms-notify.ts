import { prisma } from "@/lib/prisma"
import { sendSms } from "@/lib/sms"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { manageUrl } from "@/lib/portal/links"
import { toE164Mobile } from "@/lib/portal/phone"
import { hasFeature } from "@/lib/portal/plans"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { formatLondonDateTime, londonParts } from "@/lib/portal/tz"
import { getServiceLabel } from "@/lib/utils"

export type SmsKind = "REMINDER" | "CONFIRMED" | "CANCELLED" | "RESCHEDULED"

/** Texts per booking, however many times it is changed — a runaway loop or a very busy booking can't run up a bill. */
export const MAX_SMS_PER_BOOKING = 6

export type SmsOutcome = "sent" | "failed" | "skipped:no-consent" | "skipped:garage-off" | "skipped:no-mobile" | "skipped:quiet-hours" | "skipped:cap" | "skipped:no-provider" | "skipped:not-found"

/** Reminders aren't sent overnight (21:00–08:00 London); the hourly job simply tries again in the morning. */
export function inQuietHours(now: Date): boolean {
  const hour = Number(londonParts(now).hour)
  return hour >= 21 || hour < 8
}

interface TextContext {
  garage: string
  garagePhone: string
  service: string
  when: string
  link: string | null
}

export function smsText(kind: SmsKind, c: TextContext): string {
  const manage = c.link ? ` Manage: ${c.link}` : ""
  switch (kind) {
    case "REMINDER":
      return `Reminder: ${c.service} at ${c.garage}, ${c.when}.${manage}`
    case "CONFIRMED":
      return `${c.garage} has confirmed your ${c.service} for ${c.when}.${manage}`
    case "RESCHEDULED":
      return `${c.garage} has moved your ${c.service} to ${c.when}.${manage}`
    case "CANCELLED":
      return `${c.garage}: your ${c.service} booking for ${c.when} was cancelled. Not expecting this? Call ${c.garagePhone}.`
  }
}

/**
 * Text the customer about their booking if they agreed to texts, the garage has texting switched on, and they gave
 * a UK mobile. Never throws: a failed text must not break the booking change that triggered it. Every send (and
 * failure) is written to the booking history.
 */
export async function notifyCustomerSms(bookingId: string, kind: SmsKind, now: Date = new Date()): Promise<SmsOutcome> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { garage: { select: { name: true, phone: true, portalSettings: true, plan: true, subscriptionStatus: true } }, owner: { select: { smsOptIn: true, phone: true } } },
    })
    if (!booking) return "skipped:not-found"

    if (!(booking.smsOptIn || booking.owner?.smsOptIn)) return "skipped:no-consent"
    if (!parsePortalSettings(booking.garage.portalSettings).notifications.smsCustomer) return "skipped:garage-off"
    if (!hasFeature(booking.garage, "sms")) return "skipped:garage-off" // texting isn't part of the garage's plan
    const to = toE164Mobile(booking.customerPhone) ?? toE164Mobile(booking.owner?.phone)
    if (!to) return "skipped:no-mobile"
    if (kind === "REMINDER" && inQuietHours(now)) return "skipped:quiet-hours"
    if ((await prisma.bookingEvent.count({ where: { bookingId, type: "SMS" } })) >= MAX_SMS_PER_BOOKING) return "skipped:cap"

    const result = await sendSms({
      to,
      body: smsText(kind, {
        garage: booking.garage.name,
        garagePhone: booking.garage.phone,
        service: getServiceLabel(booking.serviceType),
        when: formatLondonDateTime(booking.scheduledAt),
        link: manageUrl(booking.manageToken),
      }),
    })
    // No provider configured (dev/CI): nothing was sent, so nothing is recorded or counted.
    if (result.skipped) return "skipped:no-provider"
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "SMS", detail: result.success ? `Text sent: ${kind.toLowerCase()}` : `Text FAILED (${kind.toLowerCase()}): ${result.error ?? "unknown error"}` })
    return result.success ? "sent" : "failed"
  } catch (err) {
    console.error("[sms] notify failed for booking", bookingId, err)
    return "failed"
  }
}
