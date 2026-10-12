// Run by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET
// environment variable is set, which is what this route checks, so it also can't be invoked by the public.
import { NextResponse } from "next/server"
import { sendVehicleReminders } from "@/lib/vehicle-reminders"

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { sent, skipped } = await sendVehicleReminders()
    return NextResponse.json({ success: true, remindersSent: sent, skipped })
  } catch (err) {
    console.error("Reminders cron error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
