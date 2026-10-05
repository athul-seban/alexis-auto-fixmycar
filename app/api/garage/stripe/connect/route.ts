import { NextResponse } from "next/server"
import { withGarage } from "@/lib/garage-auth"
import { stripeConfigured } from "@/lib/stripe"
import { refreshConnectStatus, startConnectOnboarding } from "@/lib/portal/stripe-connect"

/** Where a garage stands with Stripe. Re-reads the account from Stripe so a garage returning from onboarding sees it at once. */
export const GET = withGarage("Garage stripe status GET", async (_req, { garage }) => {
  if (!stripeConfigured()) return NextResponse.json({ available: false, connected: false, enabled: false })
  try {
    const s = await refreshConnectStatus(garage)
    return NextResponse.json({ available: true, ...s })
  } catch (err) {
    // Stripe being unreachable shouldn't break the Website page: fall back to what we last knew.
    console.error("[stripe connect] status refresh failed:", err)
    return NextResponse.json({ available: true, connected: Boolean(garage.stripeAccountId), enabled: garage.stripeChargesEnabled })
  }
})

/** Start (or resume) onboarding; the response is the Stripe-hosted URL to send the garage to. */
export const POST = withGarage(
  "Garage stripe connect POST",
  async (_req, { garage }) => {
    if (!stripeConfigured()) return NextResponse.json({ error: "Online payments aren't set up on this platform yet.", code: "PAYMENTS_UNAVAILABLE" }, { status: 409 })
    const url = await startConnectOnboarding(garage)
    return NextResponse.json({ url })
  },
  { write: true }
)
