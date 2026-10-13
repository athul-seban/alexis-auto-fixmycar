import type { JobRequest, Quote } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { notifyGarage, notifyUser } from "@/lib/notifications"
import { jobResponseGuestNotification, quoteExpiredEmail, quoteReceivedEmail, requestExpiredGuestEmail } from "@/lib/email-templates"
import { absoluteUrl } from "@/lib/portal/links"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import {
  estimateQuote,
  instantQuote,
  parseWorks,
  sumItems,
  type LineItem,
  type PriceRow,
} from "@/lib/portal/quote-pricing"
import { getServiceLabel } from "@/lib/utils"

// The one place that answers a request for a quote from a named garage (a guest JobRequest with targetGarageId, or a
// signed-in owner's Quote): instantly when the garage priced every work, otherwise by a deadline the garage sets,
// after which the request closes or turns into an estimate (the garage's choice). Nothing here reveals customer details.

/** How long an instant or estimated price stays valid for the customer. */
export const AUTO_QUOTE_VALID_DAYS = 7
const SWEEP_LIMIT = 100

const ESTIMATE_NOTE = "Estimate: this garage didn't confirm a price in time, so this is based on its listed prices. The final price is confirmed with the garage."
const validUntil = () => new Date(Date.now() + AUTO_QUOTE_VALID_DAYS * 86_400_000)
const itemsJson = (items: LineItem[]) => JSON.stringify(items)
const worksLabel = (works: string[]) => works.map(getServiceLabel).join(", ")

async function priceRows(garageId: string): Promise<PriceRow[]> {
  const rows = await prisma.servicePrice.findMany({ where: { garageId } })
  return rows.map((r) => ({ serviceType: r.serviceType, isActive: r.isActive, autoQuote: r.autoQuote, fixedPrice: r.fixedPrice, priceFrom: r.priceFrom }))
}

const autoQuotedGarageNote = (works: string[], total: number) => ({
  title: "Instant quote sent",
  body: `Your listed prices were sent for ${worksLabel(works)} (£${total.toFixed(2)}). The customer's details are shared if they accept.`,
})

/** Guest job aimed at one garage: if every work has an automatic price, send the quote now. Returns whether it did. */
export async function autoQuoteJob(jobId: string): Promise<boolean> {
  const job = await prisma.jobRequest.findUnique({ where: { id: jobId } })
  if (!job || !job.targetGarageId || job.status !== "OPEN") return false
  const garage = await prisma.garage.findUnique({ where: { id: job.targetGarageId } })
  if (!garage || garage.status !== "APPROVED") return false

  const works = parseWorks(job.services, job.serviceType)
  const items = instantQuote(works, await priceRows(garage.id))
  if (!items) return false

  const total = sumItems(items)
  const claimed = await prisma.jobRequest.updateMany({ where: { id: job.id, status: "OPEN" }, data: { status: "QUOTED" } })
  if (claimed.count === 0) return false
  const jobResponse = await prisma.jobResponse.create({
    data: { jobRequestId: job.id, garageId: garage.id, price: total, source: "AUTO", lineItems: itemsJson(items), validUntil: validUntil(), status: "SENT" },
  })
  await sendMail({ to: job.guestEmail, ...jobResponseGuestNotification({ jobRequest: job, jobResponse, garage }) })
  await notifyGarage({ garageId: garage.id, type: "QUOTE_AUTO_SENT", ...autoQuotedGarageNote(works, total), link: "/garage-dashboard/enquiries?stage=estimates" }).catch(() => {})
  return true
}

/** Owner quote aimed at one garage: same instant answer. */
export async function autoQuoteQuote(quoteId: string): Promise<boolean> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { owner: { select: { name: true, email: true, emailNotifications: true } }, garage: true } })
  if (!quote || quote.status !== "PENDING" || quote.garage.status !== "APPROVED") return false

  const works = parseWorks(quote.services, quote.serviceType)
  const items = instantQuote(works, await priceRows(quote.garageId))
  if (!items) return false

  const total = sumItems(items)
  const until = validUntil()
  const claimed = await prisma.quote.updateMany({
    where: { id: quote.id, status: "PENDING" },
    data: { status: "SENT", price: total, source: "AUTO", lineItems: itemsJson(items), validUntil: until },
  })
  if (claimed.count === 0) return false
  await sendReceived(quote, total, until, null)
  await notifyGarage({ garageId: quote.garageId, type: "QUOTE_AUTO_SENT", ...autoQuotedGarageNote(works, total), link: "/garage-dashboard/enquiries?stage=estimates" }).catch(() => {})
  return true
}

async function sendReceived(
  quote: Quote & { owner: { name: string | null; email: string; emailNotifications: boolean }; garage: { name: string } },
  price: number,
  until: Date,
  notes: string | null
) {
  await notifyUser({
    userId: quote.ownerId,
    type: "QUOTE_RESPONDED",
    title: `${quote.garage.name} sent you a quote`,
    body: `Quoted £${price.toFixed(2)} for your ${worksLabel(parseWorks(quote.services, quote.serviceType))} request`,
    link: "/dashboard/quotes",
  })
  if (quote.owner.emailNotifications) {
    await sendMail({
      to: quote.owner.email,
      ...quoteReceivedEmail({
        customerName: quote.owner.name,
        garageName: quote.garage.name,
        serviceType: quote.serviceType,
        price,
        validUntil: until,
        notes,
        ctaHref: absoluteUrl("/dashboard/quotes"),
      }),
    })
  }
}

async function expireJob(job: JobRequest): Promise<void> {
  const garage = job.targetGarageId ? await prisma.garage.findUnique({ where: { id: job.targetGarageId } }) : null
  if (!garage) return
  const works = parseWorks(job.services, job.serviceType)
  const settings = parsePortalSettings(garage.portalSettings).quotes
  const estimate = settings.onExpiry === "ESTIMATE" ? estimateQuote(works, await priceRows(garage.id)) : null

  if (estimate) {
    const claimed = await prisma.jobRequest.updateMany({ where: { id: job.id, status: "OPEN" }, data: { status: "QUOTED" } })
    if (claimed.count === 0) return
    const jobResponse = await prisma.jobResponse.create({
      data: { jobRequestId: job.id, garageId: garage.id, price: sumItems(estimate), source: "ESTIMATE", lineItems: itemsJson(estimate), message: ESTIMATE_NOTE, validUntil: validUntil(), status: "SENT" },
    })
    await sendMail({ to: job.guestEmail, ...jobResponseGuestNotification({ jobRequest: job, jobResponse, garage }) })
    return
  }
  const claimed = await prisma.jobRequest.updateMany({ where: { id: job.id, status: "OPEN" }, data: { status: "EXPIRED" } })
  if (claimed.count === 0) return
  await sendMail({ to: job.guestEmail, ...requestExpiredGuestEmail({ jobRequest: job, garageName: garage.name }) })
}

async function expireQuote(quote: Quote): Promise<void> {
  const full = await prisma.quote.findUnique({ where: { id: quote.id }, include: { owner: { select: { name: true, email: true, emailNotifications: true } }, garage: true } })
  if (!full) return
  const works = parseWorks(full.services, full.serviceType)
  const settings = parsePortalSettings(full.garage.portalSettings).quotes
  const estimate = settings.onExpiry === "ESTIMATE" ? estimateQuote(works, await priceRows(full.garageId)) : null

  if (estimate) {
    const total = sumItems(estimate)
    const until = validUntil()
    const claimed = await prisma.quote.updateMany({
      where: { id: full.id, status: "PENDING" },
      data: { status: "SENT", price: total, source: "ESTIMATE", lineItems: itemsJson(estimate), notes: ESTIMATE_NOTE, validUntil: until },
    })
    if (claimed.count === 1) await sendReceived(full, total, until, ESTIMATE_NOTE)
    return
  }
  const claimed = await prisma.quote.updateMany({ where: { id: full.id, status: "PENDING" }, data: { status: "EXPIRED" } })
  if (claimed.count === 0) return
  await notifyUser({
    userId: full.ownerId,
    type: "QUOTE_EXPIRED",
    title: `${full.garage.name} didn't reply in time`,
    body: `Your ${worksLabel(works)} request was closed. You can ask another garage.`,
    link: "/search",
  }).catch(() => {})
  if (full.owner.emailNotifications) {
    await sendMail({ to: full.owner.email, ...quoteExpiredEmail({ customerName: full.owner.name, garageName: full.garage.name, serviceType: full.serviceType, ctaHref: absoluteUrl("/search") }) })
  }
}

/**
 * Close (or turn into an estimate) every request whose garage missed its deadline. Safe to call often and from many
 * places: each request is claimed with a compare-and-swap on its status, so it is processed exactly once.
 * Called lazily wherever requests are read or accepted, and swept daily by the cron job.
 */
export async function expireDueRequests(scope: { garageId?: string; ownerId?: string; jobId?: string } = {}): Promise<number> {
  const now = new Date()
  const [jobs, quotes] = await Promise.all([
    scope.ownerId
      ? Promise.resolve([] as JobRequest[])
      : prisma.jobRequest.findMany({
          where: {
            status: "OPEN",
            respondBy: { lt: now },
            targetGarageId: scope.garageId ?? { not: null },
            ...(scope.jobId ? { id: scope.jobId } : {}),
          },
          take: SWEEP_LIMIT,
        }),
    scope.jobId
      ? Promise.resolve([] as Quote[])
      : prisma.quote.findMany({
          where: { status: "PENDING", respondBy: { lt: now }, ...(scope.garageId ? { garageId: scope.garageId } : {}), ...(scope.ownerId ? { ownerId: scope.ownerId } : {}) },
          take: SWEEP_LIMIT,
        }),
  ])
  let processed = 0
  for (const job of jobs) {
    await expireJob(job).catch((err) => console.error("expireJob failed", job.id, err))
    processed += 1
  }
  for (const quote of quotes) {
    await expireQuote(quote).catch((err) => console.error("expireQuote failed", quote.id, err))
    processed += 1
  }
  return processed
}
