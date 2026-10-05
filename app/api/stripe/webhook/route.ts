import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { handleStripeEvent } from "@/lib/portal/payment-service"

// Stripe calls this for checkout and refund events. It must read the RAW body: the signature is computed over the
// exact bytes Stripe sent, so parsing the JSON first would make every verification fail.
export async function POST(req: Request) {
  const stripe = getStripe()
  // Stripe signs platform events and connected-account events (account.updated) with different endpoint secrets.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => Boolean(s))
  if (!stripe || secrets.length === 0) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 })

  const signature = req.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  const body = await req.text()
  let event: ReturnType<typeof stripe.webhooks.constructEvent> | null = null
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret)
      break
    } catch {
      /* try the next secret */
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  try {
    const fresh = await handleStripeEvent(event)
    return NextResponse.json({ received: true, duplicate: !fresh })
  } catch (err) {
    // A 5xx makes Stripe retry later, which is what we want for a transient failure.
    console.error("[stripe webhook] handler failed:", event.type, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}
