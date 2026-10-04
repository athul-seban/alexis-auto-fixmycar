import Stripe from "stripe"

let client: Stripe | null | undefined

/**
 * The Stripe client, or null when STRIPE_SECRET_KEY isn't set (local dev, CI). Callers treat null as "online
 * payments aren't available" and fall back to booking without a deposit, so a missing key never breaks booking.
 */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client
  const key = process.env.STRIPE_SECRET_KEY
  client = key ? new Stripe(key) : null
  return client
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY)
