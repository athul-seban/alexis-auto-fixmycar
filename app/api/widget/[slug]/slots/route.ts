import { NextResponse } from "next/server"
import { z } from "zod"
import { isValidDateString } from "@/lib/portal/tz"
import { computeDaySlots, findWidgetService, loadWidgetGarage } from "@/lib/portal/widget-service"
import { limitByIp } from "@/lib/rate-limit"

const querySchema = z.object({
  date: z.string().refine(isValidDateString, "date must be YYYY-MM-DD"),
  service: z.string().min(1).max(40),
})

// Public (no auth): bookable start times for one day. Never cached — availability changes constantly.
export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  // Each call works out a whole day of availability from the database, so it is limited per visitor. Someone browsing a
  // month of days makes a few dozen calls, so this is generous.
  const limited = await limitByIp(req.headers, "widget-slots", 120, 60_000)
  if (limited) return limited
  const sp = new URL(req.url).searchParams
  const parsed = querySchema.safeParse({ date: sp.get("date"), service: sp.get("service") })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  try {
    const w = await loadWidgetGarage(slug)
    if (!w) return NextResponse.json({ error: "Booking isn't available for this garage" }, { status: 404 })

    const service = findWidgetService(w, parsed.data.service)
    if (!service) return NextResponse.json({ error: "That service isn't available to book online" }, { status: 400 })

    const slots = await computeDaySlots(w, service, parsed.data.date)
    return NextResponse.json(
      { date: parsed.data.date, slots: slots.map((s) => ({ start: s.start.toISOString(), label: s.label })) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    console.error("Widget slots GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
