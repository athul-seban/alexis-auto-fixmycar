import { formatCurrency, getServiceLabel } from "@/lib/utils"
import type { Garage, JobRequest, JobResponse } from "@prisma/client"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function wrapper(title: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  return `
  <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
    <div style="background: #1E3A5F; padding: 24px 32px; border-radius: 12px 12px 0 0;">
      <span style="color: #fff; font-size: 20px; font-weight: 800;">Quote<span style="color: #F97316;">MyGarage</span></span>
    </div>
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
      <h1 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">${title}</h1>
      <div style="color: #334155; font-size: 14px; line-height: 1.6;">${bodyHtml}</div>
      <a href="${ctaHref}" style="display: inline-block; margin-top: 24px; background: #F97316; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 8px;">${ctaLabel}</a>
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
    `<p>Hi ${garage.name},</p>
     <p>A customer near you is looking for <strong>${getServiceLabel(jobRequest.serviceType)}</strong>:</p>
     <p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">${jobRequest.description}</p>
     <p><strong>Vehicle:</strong> ${jobRequest.year} ${jobRequest.make} ${jobRequest.model} (${jobRequest.registration})<br/>
     <strong>Location:</strong> ${jobRequest.city}, ${jobRequest.postcode}</p>
     <p style="color:#64748b; font-size:12px;">We matched you based on your registered services and location. Log in to your garage dashboard to send a quote.</p>`,
    `${APP_URL}/garage-dashboard`,
    "View Job Requests"
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
      ? `We've notified <strong>${matchedCount} garage${matchedCount === 1 ? "" : "s"}</strong> near ${jobRequest.city}.`
      : `We didn't find a garage nearby just yet — we'll keep matching you as new garages join.`
  const html = wrapper(
    subject,
    `<p>Hi ${jobRequest.guestName},</p>
     <p>Your job request for <strong>${getServiceLabel(jobRequest.serviceType)}</strong> on your ${jobRequest.year} ${jobRequest.make} ${jobRequest.model} is live.</p>
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
    `<p>Hi ${jobRequest.guestName},</p>
     <p>You've accepted <strong>${garage.name}</strong>'s quote of <strong>${formatCurrency(price)}</strong> for your ${getServiceLabel(jobRequest.serviceType)}.</p>
     <p>The garage will be in touch on <strong>${jobRequest.guestPhone}</strong> to confirm the exact time.</p>
     <p><strong>Garage contact:</strong> ${garage.phone} · ${garage.email}</p>`,
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
    `<p>Good news — <strong>${jobRequest.guestName}</strong> accepted your quote of <strong>${formatCurrency(price)}</strong> for ${getServiceLabel(jobRequest.serviceType)}.</p>
     <p><strong>Vehicle:</strong> ${jobRequest.year} ${jobRequest.make} ${jobRequest.model} (${jobRequest.registration})<br/>
     <strong>Customer contact:</strong> ${jobRequest.guestPhone} · ${jobRequest.guestEmail}</p>
     <p>Please reach out to confirm the exact appointment time.</p>`,
    `${APP_URL}/garage-dashboard`,
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
    `<p>Hi ${jobRequest.guestName},</p>
     <p><strong>${garage.name}</strong> (${garage.city}) sent you a quote of <strong>${formatCurrency(jobResponse.price)}</strong> for your ${getServiceLabel(jobRequest.serviceType)}.</p>
     ${jobResponse.message ? `<p style="background:#f8fafc; border-radius:8px; padding:12px 16px;">"${jobResponse.message}"</p>` : ""}
     <p>Compare all your quotes side-by-side and accept the best one.</p>`,
    `${APP_URL}/post-job/track/${jobRequest.token}`,
    "Compare My Quotes"
  )
  return { subject, html }
}
