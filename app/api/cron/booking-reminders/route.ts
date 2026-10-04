// Hit hourly by an external scheduler (EventBridge etc. — see AWS-DEPLOYMENT.md) with
// `Authorization: Bearer $CRON_SECRET`. Sends the 24-hour appointment reminders.
import { NextResponse } from "next/server"
import { sendDueBookingReminders } from "@/lib/portal/reminders"

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await sendDueBookingReminders())
  } catch (err) {
    console.error("Booking reminders cron error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
