import { escapeHtml as e, formatCurrency, formatDateShort, getServiceLabel } from "@/lib/utils"
import type { Garage, JobRequest, JobResponse } from "@prisma/client"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

// Every user-supplied value interpolated below goes through e() (HTML-escape).
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
}: {
  jobRequest: JobRequest
  price: number
}): { subject: string; html: string } {
  const subject = `${jobRequest.guestName} accepted your quote (${formatCurrency(price)})`
  const html = wrapper(
    subject,
    `<p>Good news — <strong>${e(jobRequest.guestName)}</strong> accepted your quote of <strong>${formatCurrency(price)}</strong> for ${e(getServiceLabel(jobRequest.serviceType))}.</p>
     <p><strong>Vehicle:</strong> ${jobRequest.year} ${e(jobRequest.make)} ${e(jobRequest.model)} (${e(jobRequest.registration)})<br/>
     <strong>Customer contact:</strong> ${e(jobRequest.guestPhone)} · ${e(jobRequest.guestEmail)}</p>
     <p>Please reach out to confirm the exact appointment time.</p>`,
    `${APP_URL}/garage-dashboard/bookings`,
    "View Bookings"
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
  garageName, customerName, serviceType, whenLabel, vehicle, reference, source, ctaHref,
}: {
  garageName: string
  customerName: string | null
  serviceType: string
  whenLabel: string
  vehicle: string
  reference: string | null
  source: string
  ctaHref: string
}): { subject: string; html: string } {
  const subject = `New booking: ${getServiceLabel(serviceType)} for ${vehicle}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(garageName)},</p>
     <p>${e(customerName ?? "A customer")} has booked <strong>${e(getServiceLabel(serviceType))}</strong> (${e(source)}).</p>
     <p><strong>When:</strong> ${e(whenLabel)}<br/><strong>Vehicle:</strong> ${e(vehicle)}${reference ? `<br/><strong>Reference:</strong> ${e(reference)}` : ""}</p>`,
    ctaHref,
    "View Booking"
  )
  return { subject, html }
}

export function garageBookingCancelledEmail({
  garageName, customerName, serviceType, whenLabel, ctaHref,
}: { garageName: string; customerName: string | null; serviceType: string; whenLabel: string; ctaHref: string }): { subject: string; html: string } {
  const subject = `Booking cancelled: ${getServiceLabel(serviceType)} on ${whenLabel}`
  const html = wrapper(
    subject,
    `<p>Hi ${e(garageName)},</p>
     <p>${e(customerName ?? "A customer")} cancelled their <strong>${e(getServiceLabel(serviceType))}</strong> booking for ${e(whenLabel)}. The slot is free again in your diary.</p>`,
    ctaHref,
    "View Booking"
  )
  return { subject, html }
}

export function garageReviewEmail({
  garageName, rating, comment, ctaHref,
}: { garageName: string; rating: number; comment: string; ctaHref: string }): { subject: string; html: string } {
  const subject = `New ${rating}-star review`
  const html = wrapper(
    subject,
    `<p>Hi ${e(garageName)},</p>
     <p>A customer left you a <strong>${rating}-star</strong> review:</p>
     <p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">"${e(comment.slice(0, 400))}"</p>
     <p>You can reply to it from your portal.</p>`,
    ctaHref,
    "Reply to Review"
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
