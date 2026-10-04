import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { handleStripeEvent } from "@/lib/portal/payment-service"

// Stripe calls this for checkout and refund events. It must read the RAW body: the signature is computed over the
// exact bytes Stripe sent, so parsing the JSON first would make every verification fail.
export async function POST(req: Request) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 })

  const signature = req.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  let event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    const fresh = await handleStripeEvent(event)
    return NextResponse.json({ received: true, duplicate: !fresh })
  } catch (err) {
    // A 5xx makes Stripe retry later, which is what we want for a transient failure.
    console.error("[stripe webhook] handler failed:", event.type, err)
    return NextResponse.json({ error: "Handler failed" }, { status: 500 })
  }
}
