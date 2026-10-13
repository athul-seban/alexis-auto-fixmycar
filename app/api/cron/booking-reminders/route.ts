// Run by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET
// environment variable is set, which is what this route checks, so it also can't be invoked by the public.
import { NextResponse } from "next/server"
import { sendDueBookingReminders, sendDueSmsReminders } from "@/lib/portal/reminders"
import { sendDueReviewRequests } from "@/lib/portal/review-requests"
import { expireDueRequests } from "@/lib/portal/quote-request-service"

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const email = await sendDueBookingReminders()
    const sms = await sendDueSmsReminders()
    const reviews = await sendDueReviewRequests()
    // Requests whose garage missed its quoting deadline (also closed lazily whenever they're read).
    const expiredQuoteRequests = await expireDueRequests()
    return NextResponse.json({ ...email, sms, reviews, expiredQuoteRequests })
  } catch (err) {
    console.error("Booking reminders cron error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
