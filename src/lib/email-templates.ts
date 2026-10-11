import { escapeHtml as e, formatCurrency, formatDateShort, getServiceLabel } from "@/lib/utils"
import type { Garage, JobRequest, JobResponse } from "@prisma/client"
import { DEFAULT_MESSAGES, makeTranslator, type MessageKey, type Translate } from "@/lib/i18n/messages"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// Every user-supplied value interpolated below goes through e() (HTML-escape).

// Garage-facing emails take their wording from the admin-editable copy (Admin > Site content > Garage emails). Callers
// pass a translator built from the live copy; without one the built-in English text is used.
const builtInCopy: Translate = makeTranslator(DEFAULT_MESSAGES.en)

/** Editable wording -> safe HTML: placeholders filled, everything escaped, then **bold** allowed. */
function rich(t: Translate, key: MessageKey, vars?: Record<string, string | number>): string {
  return e(t(key, vars)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}
export function wrapper(title: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  return `
  <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
    <div style="background: #1E3A5F; padding: 24px 32px; border-radius: 12px 12px 0 0;">
      <span style="color: #fff; font-size: 20px; font-weight: 800;">Quote<span style="color: #F97316;">MyGarage</span></span>
    </div>
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
      <h1 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">${e(title)}</h1>
      <div style="color: #334155; font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
      <a href="${ctaHref}" style="display: inline-block; margin-top: 24px; background: #F97316; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 8px;">${e(ctaLabel)}</a>
    </div>
  </div>`
}

export function jobRequestGarageNotification({
  garage,
  jobRequest,
}: {
  garage: Garage
  jobRequest: JobRequest
}): { subject: string; html: string } {
  const subject = `New job near you: ${getServiceLabel(jobRequest.serviceType)} in ${jobRequest.city}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(garage.name)},</p>
     <p>A customer near you is looking for <strong>${e(getServiceLabel(jobRequest.serviceType))}</strong>:</p>
     <p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">${e(jobRequest.description)}</p>
     <p><strong>Vehicle:</strong> ${jobRequest.year} ${e(jobRequest.make)} ${e(jobRequest.model)} (${e(jobRequest.registration)})<br/>
     <strong>Location:</strong> ${e(jobRequest.city)}, ${e(jobRequest.postcode)}</p>
     <p style="color:#64748b; font-size:12px;">We matched you based on your registered services and location. Log in to your garage portal to send a quote.</p>`,
    `${APP_URL}/garage-dashboard/enquiries`,
    "View Enquiries"
  )
  return { subject, html }
}

export function jobRequestGuestConfirmation({
  jobRequest,
  matchedCount,
}: {
  jobRequest: JobRequest
  matchedCount: number
}): { subject: string; html: string } {
  const subject = "We've received your job request"
  const notifiedLine =
    matchedCount > 0
      ? `We've notified <strong>${matchedCount} garage${matchedCount === 1 ? "" : "s"}</strong> near ${e(jobRequest.city)}.`
      : `We didn't find a garage nearby just yet — we'll keep matching you as new garages join.`
  const html = wrapper(
    subject,
    `<p>Hi ${e(jobRequest.guestName)},</p>
     <p>Your job request for <strong>${e(getServiceLabel(jobRequest.serviceType))}</strong> on your ${jobRequest.year} ${e(jobRequest.make)} ${e(jobRequest.model)} is live.</p>
     <p>${notifiedLine}</p>
     <p>Bookmark your tracking link below to see quotes as they arrive — there's no account or password needed.</p>`,
    `${APP_URL}/post-job/track/${jobRequest.token}`,
    "Track My Quotes"
  )
  return { subject, html }
}

export function bookingConfirmedGuestNotification({
  jobRequest,
  garage,
  price,
}: {
  jobRequest: JobRequest
  garage: Garage
  price: number
}): { subject: string; html: string } {
  const subject = `Booking confirmed with ${garage.name}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(jobRequest.guestName)},</p>
     <p>You've accepted <strong>${e(garage.name)}</strong>'s quote of <strong>${formatCurrency(price)}</strong> for your ${e(getServiceLabel(jobRequest.serviceType))}.</p>
     <p>The garage will be in touch on <strong>${e(jobRequest.guestPhone)}</strong> to confirm the exact time.</p>
     <p><strong>Garage contact:</strong> ${e(garage.phone)} · ${e(garage.email)}</p>`,
    `${APP_URL}/post-job/track/${jobRequest.token}`,
    "View Booking"
  )
  return { subject, html }
}

export function bookingConfirmedGarageNotification({
  jobRequest,
  price,
  t = builtInCopy,
}: {
  jobRequest: JobRequest
  price: number
  t?: Translate
}): { subject: string; html: string } {
  const vars = { customer: jobRequest.guestName, price: formatCurrency(price), service: getServiceLabel(jobRequest.serviceType) }
  const subject = t("email.accepted.subject", vars)
  const html = wrapper(
    subject,
    `<p>${rich(t, "email.accepted.intro", vars)}</p>
     <p><strong>Vehicle:</strong> ${jobRequest.year} ${e(jobRequest.make)} ${e(jobRequest.model)} (${e(jobRequest.registration)})<br/>
     <strong>Customer contact:</strong> ${e(jobRequest.guestPhone)} · ${e(jobRequest.guestEmail)}</p>
     <p>${rich(t, "email.accepted.outro")}</p>`,
    `${APP_URL}/garage-dashboard/bookings`,
    t("email.accepted.cta")
  )
  return { subject, html }
}

export function jobResponseGuestNotification({
  jobRequest,
  jobResponse,
  garage,
}: {
  jobRequest: JobRequest
  jobResponse: JobResponse
  garage: Garage
}): { subject: string; html: string } {
  const subject = `New quote from ${garage.name}: ${formatCurrency(jobResponse.price)}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(jobRequest.guestName)},</p>
     <p><strong>${e(garage.name)}</strong> (${e(garage.city)}) sent you a quote of <strong>${formatCurrency(jobResponse.price)}</strong> for your ${e(getServiceLabel(jobRequest.serviceType))}.</p>
     ${jobResponse.message ? `<p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">"${e(jobResponse.message)}"</p>` : ""}
     <p>Compare all your quotes side-by-side and accept the best one.</p>`,
    `${APP_URL}/post-job/track/${jobRequest.token}`,
    "Compare My Quotes"
  )
  return { subject, html }
}

/** Sent to a walk-in/phone customer when the garage books them in from the portal. */
export function garageBookingCustomerEmail({
  garage,
  customerName,
  serviceType,
  whenLabel,
  reference,
  vehicle,
  manageHref,
}: {
  garage: { name: string; phone: string }
  customerName: string | null
  serviceType: string
  whenLabel: string
  reference: string | null
  vehicle: string
  manageHref?: string | null
}): { subject: string; html: string } {
  const subject = `Your booking with ${garage.name}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(customerName ?? "there")},</p>
     <p><strong>${e(garage.name)}</strong> has booked you in for <strong>${e(getServiceLabel(serviceType))}</strong>.</p>
     <p><strong>When:</strong> ${e(whenLabel)}<br/>
     <strong>Vehicle:</strong> ${e(vehicle)}${reference ? `<br/><strong>Reference:</strong> ${e(reference)}` : ""}</p>
     <p>Need to change it? Call the garage on <strong>${e(garage.phone)}</strong>.</p>`,
    manageHref ?? `${APP_URL}`,
    manageHref ? "View or cancel your booking" : "Visit Quote My Garage"
  )
  return { subject, html }
}

/** Confirmation sent to someone who booked through a garage's website widget. */
export function widgetBookingCustomerEmail({
  garage, customerName, serviceType, whenLabel, vehicle, reference, confirmed, extraMessage, manageHref,
}: {
  manageHref?: string | null
  garage: { name: string; phone: string; address: string; city: string; postcode: string }
  customerName: string
  serviceType: string
  whenLabel: string
  vehicle: string
  reference: string | null
  confirmed: boolean
  extraMessage?: string
}): { subject: string; html: string } {
  const subject = confirmed ? `Booking confirmed with ${garage.name}` : `Booking request received by ${garage.name}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(customerName)},</p>
     <p>${confirmed
       ? `Your booking with <strong>${e(garage.name)}</strong> is confirmed.`
       : `<strong>${e(garage.name)}</strong> has received your booking request and will confirm it shortly.`}</p>
     <p><strong>Service:</strong> ${e(getServiceLabel(serviceType))}<br/>
     <strong>When:</strong> ${e(whenLabel)}<br/>
     <strong>Vehicle:</strong> ${e(vehicle)}${reference ? `<br/><strong>Reference:</strong> ${e(reference)}` : ""}</p>
     <p><strong>Where:</strong> ${e(garage.address)}, ${e(garage.city)} ${e(garage.postcode)}<br/>
     <strong>Need to change it?</strong> Call ${e(garage.phone)} and quote your reference${manageHref ? ", or cancel it online with the button below" : ""}.</p>
     ${extraMessage ? `<p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">${e(extraMessage)}</p>` : ""}`,
    manageHref ?? APP_URL,
    manageHref ? "View or cancel your booking" : "Visit Quote My Garage"
  )
  return { subject, html }
}

// ── Garage-facing emails (each respects the garage's notification toggles; see garage-email.ts) ──

export function garageNewBookingEmail({
  garageName, customerName, serviceType, whenLabel, vehicle, reference, source, ctaHref, t = builtInCopy,
}: {
  t?: Translate
  garageName: string
  customerName: string | null
  serviceType: string
  whenLabel: string
  vehicle: string
  reference: string | null
  source: string
  ctaHref: string
}): { subject: string; html: string } {
  const vars = { customer: customerName ?? "A customer", service: getServiceLabel(serviceType), vehicle, when: whenLabel, source, reference: reference ?? "" }
  const subject = t("email.newBooking.subject", vars)
  const html = wrapper(
    subject,
    `<p>${rich(t, "email.greeting", { name: garageName })}</p>
     <p>${rich(t, "email.newBooking.intro", vars)}</p>
     <p><strong>When:</strong> ${e(whenLabel)}<br/><strong>Vehicle:</strong> ${e(vehicle)}${reference ? `<br/><strong>Reference:</strong> ${e(reference)}` : ""}</p>`,
    ctaHref,
    t("email.newBooking.cta")
  )
  return { subject, html }
}

export function garageBookingCancelledEmail({
  garageName, customerName, serviceType, whenLabel, ctaHref, t = builtInCopy,
}: { garageName: string; customerName: string | null; serviceType: string; whenLabel: string; ctaHref: string; t?: Translate }): { subject: string; html: string } {
  const vars = { customer: customerName ?? "A customer", service: getServiceLabel(serviceType), when: whenLabel }
  const subject = t("email.cancelled.subject", vars)
  const html = wrapper(
    subject,
    `<p>${rich(t, "email.greeting", { name: garageName })}</p>
     <p>${rich(t, "email.cancelled.intro", vars)}</p>`,
    ctaHref,
    t("email.cancelled.cta")
  )
  return { subject, html }
}

export function garageReviewEmail({
  garageName, rating, comment, ctaHref, t = builtInCopy,
}: { garageName: string; rating: number; comment: string; ctaHref: string; t?: Translate }): { subject: string; html: string } {
  const subject = t("email.review.subject", { rating })
  const html = wrapper(
    subject,
    `<p>${rich(t, "email.greeting", { name: garageName })}</p>
     <p>${rich(t, "email.review.intro", { rating })}</p>
     <p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">"${e(comment.slice(0, 400))}"</p>
     <p>${rich(t, "email.review.outro")}</p>`,
    ctaHref,
    t("email.review.cta")
  )
  return { subject, html }
}

export function vehicleReminderNotification({
  ownerName,
  registration,
  make,
  model,
  reminderType,
  dueDate,
}: {
  ownerName: string | null
  registration: string
  make: string
  model: string
  reminderType: "MOT" | "SERVICE"
  dueDate: Date
}): { subject: string; html: string } {
  const label = reminderType === "MOT" ? "MOT test" : "service"
  const subject = `Reminder: your ${label} is due soon (${registration})`
  const html = wrapper(
    subject,
    `<p>Hi ${e(ownerName ?? "there")},</p>
     <p>Your <strong>${e(make)} ${e(model)}</strong> (${e(registration)}) has a <strong>${label}</strong> due on <strong>${formatDateShort(dueDate)}</strong>.</p>
     <p>Book ahead to avoid last-minute availability issues.</p>`,
    `${APP_URL}/search?service=${reminderType === "MOT" ? "MOT" : "FULL_SERVICE"}`,
    "Find a Garage"
  )
  return { subject, html }
}

/** "See you tomorrow" reminder sent about 24 hours before a confirmed appointment. */
export function bookingReminderEmail({
  garage, customerName, serviceType, whenLabel, vehicle, manageHref,
}: {
  garage: { name: string; phone: string; address: string; city: string; postcode: string }
  customerName: string | null
  serviceType: string
  whenLabel: string
  vehicle: string
  manageHref?: string | null
}): { subject: string; html: string } {
  const subject = `Reminder: ${getServiceLabel(serviceType)} at ${garage.name}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(customerName ?? "there")},</p>
     <p>A quick reminder about your upcoming appointment with <strong>${e(garage.name)}</strong>.</p>
     <p><strong>When:</strong> ${e(whenLabel)}<br/>
     <strong>Service:</strong> ${e(getServiceLabel(serviceType))}<br/>
     <strong>Vehicle:</strong> ${e(vehicle)}</p>
     <p><strong>Where:</strong> ${e(garage.address)}, ${e(garage.city)} ${e(garage.postcode)}<br/>
     <strong>Can't make it?</strong> Please call ${e(garage.phone)}${manageHref ? " or cancel online" : ""} so the slot can be offered to someone else.</p>`,
    manageHref ?? APP_URL,
    manageHref ? "View or cancel your booking" : "Visit Quote My Garage"
  )
  return { subject, html }
}

/** Cover email for an invoice PDF sent to the customer. */
export function invoiceCustomerEmail({
  garageName, customerName, invoiceNumber, total, balanceDue, serviceType,
}: { garageName: string; customerName: string | null; invoiceNumber: string; total: string; balanceDue: string; serviceType: string }): { subject: string; html: string } {
  const subject = `Invoice ${invoiceNumber} from ${garageName}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(customerName ?? "there")},</p>
     <p>Thanks for choosing <strong>${e(garageName)}</strong>. Your invoice for <strong>${e(getServiceLabel(serviceType))}</strong> is attached.</p>
     <p><strong>Total:</strong> ${e(total)}<br/><strong>Balance due:</strong> ${e(balanceDue)}</p>`,
    APP_URL,
    "Visit Quote My Garage"
  )
  return { subject, html }
}

/** "You have a new message" — sent to whichever side of a quote/booking conversation didn't write it. */
export function messageReceivedEmail({
  recipientName, fromName, about, preview, href, t = builtInCopy,
}: {
  recipientName: string | null
  fromName: string
  about: string
  preview: string
  href: string
  t?: Translate
}): { subject: string; html: string } {
  const vars = { from: fromName, about }
  const subject = t("email.message.subject", vars)
  const clipped = preview.length > 300 ? `${preview.slice(0, 300)}…` : preview
  const html = wrapper(
    subject,
    `<p>${rich(t, "email.greeting", { name: recipientName ?? "there" })}</p>
     <p>${rich(t, "email.message.intro", vars)}</p>
     <p style="background:#f8fafc; border-radius:8px; padding:12px 16px; white-space:pre-wrap;">${e(clipped)}</p>
     <p style="color:#64748b; font-size:12px;">${rich(t, "email.message.outro")}</p>`,
    href,
    t("email.message.cta")
  )
  return { subject, html }
}

export function passwordChangedEmail({ name }: { name: string | null }): { subject: string; html: string } {
  const subject = "Your Quote My Garage password was changed"
  const html = wrapper(
    subject,
    `<p>Hi ${e(name ?? "there")},</p>
     <p>The password on your account was just changed.</p>
     <p>If that was you, there's nothing more to do. If it wasn't, reset your password now and sign out of all devices from your account page.</p>`,
    `${APP_URL}/forgot-password`,
    "Reset my password"
  )
  return { subject, html }
}
