import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import { notifyGarage } from "@/lib/notifications"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { absoluteUrl, garageLinks, manageUrl } from "@/lib/portal/links"
import { applyAccountState } from "@/lib/portal/stripe-connect"
import { depositPence, platformFeePence, refundPence, toPence, toPounds } from "@/lib/portal/payments"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { getServiceLabel } from "@/lib/utils"

/** A checkout the customer abandons is released after this long (Stripe's minimum session life is 30 minutes). */
export const CHECKOUT_MINUTES = 30

export interface CheckoutResult {
  url: string
  sessionId: string
  depositPounds: number
}

/**
 * Start a Stripe Checkout for a booking's deposit. Returns null when no deposit applies (payments off, free job,
 * Stripe not configured) so the caller simply books without one. The booking is marked PENDING-payment; the
 * webhook flips it to PAID (or releases it if the checkout expires).
 */
export async function createDepositCheckout(bookingId: string): Promise<CheckoutResult | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { garage: true } })
  if (!booking) return null
  const settings = parsePortalSettings(booking.garage.portalSettings).payments
  const pence = depositPence(booking.totalPrice, settings)
  if (pence === 0) return null
  // The deposit is the garage's money, so it needs somewhere to go: no connected account, no online deposit.
  if (!booking.garage.stripeAccountId || !booking.garage.stripeChargesEnabled) return null
  const fee = platformFeePence(pence)

  const manage = manageUrl(booking.manageToken) ?? absoluteUrl("/")
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: booking.id,
    customer_email: booking.customerEmail ?? undefined,
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: pence,
          product_data: { name: `${settings.depositPercent}% deposit — ${getServiceLabel(booking.serviceType)} at ${booking.garage.name}` },
        },
      },
    ],
    metadata: { bookingId: booking.id },
    // Destination charge: the customer pays, Stripe moves the money (less our fee) to the garage's own account.
    payment_intent_data: {
      metadata: { bookingId: booking.id },
      transfer_data: { destination: booking.garage.stripeAccountId },
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
    },
    success_url: `${manage}?paid=1`,
    cancel_url: `${manage}?paid=0`,
  })
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL")

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "PENDING", depositAmount: toPounds(pence), stripeSessionId: session.id },
  })
  await recordBookingEvent(prisma, { bookingId: booking.id, actorType: "SYSTEM", type: "PAYMENT", detail: `Deposit of £${toPounds(pence).toFixed(2)} requested` })
  return { url: session.url, sessionId: session.id, depositPounds: toPounds(pence) }
}

/** Checkout finished and paid. Safe to call twice; only the first call changes anything. */
async function markPaid(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id
  if (!bookingId || session.payment_status !== "paid") return
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)

  const claimed = await prisma.booking.updateMany({
    where: { id: bookingId, paymentStatus: { in: ["PENDING", "FAILED"] } },
    data: { paymentStatus: "PAID", stripeSessionId: session.id, stripePaymentIntent: intent },
  })
  if (claimed.count === 0) return

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { garage: true } })
  // Auto-confirm garages get a confirmed booking once the deposit lands; others still confirm manually.
  if (booking.status === "PENDING" && parsePortalSettings(booking.garage.portalSettings).widget.autoConfirm) {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } })
  }
  await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "PAYMENT", detail: `Deposit of £${(booking.depositAmount ?? 0).toFixed(2)} paid` })
  await notifyGarage({
    garageId: booking.garageId,
    type: "BOOKING_STATUS_CHANGED",
    title: "Deposit received",
    body: `£${(booking.depositAmount ?? 0).toFixed(2)} paid for ${getServiceLabel(booking.serviceType)}`,
    link: garageLinks.booking(bookingId),
  })
}

/** The customer never completed payment: free the slot instead of holding it for someone who isn't coming. */
async function releaseExpired(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId ?? session.client_reference_id
  if (!bookingId) return
  const res = await prisma.booking.updateMany({
    where: { id: bookingId, paymentStatus: "PENDING", status: "PENDING" },
    data: { status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "Deposit not paid in time" },
  })
  if (res.count > 0) {
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "PAYMENT", detail: "Checkout expired — booking released" })
  }
}

/**
 * Apply a verified Stripe event. Webhooks are delivered at least once, so each event id is recorded first and a
 * repeat is ignored. Returns whether the event was new.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<boolean> {
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } })
  } catch {
    return false // unique violation: already handled
  }
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await markPaid(event.data.object as Stripe.Checkout.Session)
      break
    case "account.updated":
      await applyAccountState(event.data.object as Stripe.Account)
      break
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await releaseExpired(event.data.object as Stripe.Checkout.Session)
      break
  }
  return true
}

/**
 * Refund a cancelled booking's deposit according to who cancelled and the garage's policy. Never throws: a Stripe
 * failure must not block the cancellation itself, so it is recorded on the booking history for manual follow-up.
 */
export async function refundOnCancel(bookingId: string, cancelledBy: "GARAGE" | "CUSTOMER" | "SYSTEM", now: Date = new Date()): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { garage: true } })
    if (!booking || booking.paymentStatus !== "PAID" || !booking.stripePaymentIntent) return

    const pence = refundPence({
      policy: parsePortalSettings(booking.garage.portalSettings).payments.refundPolicy,
      cancelledBy,
      scheduledAt: booking.scheduledAt,
      now,
      paidPence: toPence(booking.depositAmount ?? 0),
      alreadyRefundedPence: toPence(booking.refundedAmount ?? 0),
    })
    if (pence === 0) {
      await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "PAYMENT", detail: "Cancelled — deposit kept under the refund policy" })
      return
    }

    const stripe = getStripe()
    if (!stripe) throw new Error("Stripe is not configured")
    // The idempotency key makes a retried cancel unable to refund twice.
    // reverse_transfer takes the money back from the garage's account (it was already paid to them), and the platform
    // fee is returned in proportion, so a refund costs the customer nothing and the platform keeps no fee on it.
    await stripe.refunds.create(
      { payment_intent: booking.stripePaymentIntent, amount: pence, reverse_transfer: true, refund_application_fee: true },
      { idempotencyKey: `refund:${bookingId}:${toPence(booking.refundedAmount ?? 0)}` }
    )

    const refunded = toPounds(toPence(booking.refundedAmount ?? 0) + pence)
    await prisma.booking.update({ where: { id: bookingId }, data: { refundedAmount: refunded, paymentStatus: pence >= toPence(booking.depositAmount ?? 0) ? "REFUNDED" : "PAID" } })
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "PAYMENT", detail: `£${toPounds(pence).toFixed(2)} refunded` })
  } catch (err) {
    console.error("[payments] refund failed for booking", bookingId, err)
    await recordBookingEvent(prisma, { bookingId, actorType: "SYSTEM", type: "PAYMENT", detail: "Refund FAILED — refund this deposit manually in Stripe" }).catch(() => {})
  }
}
