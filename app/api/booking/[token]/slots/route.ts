import { NextResponse } from "next/server"
import { z } from "zod"
import { BookingError } from "@/lib/portal/booking-error"
import { loadRescheduleContext } from "@/lib/portal/customer-reschedule"
import { handleRouteError } from "@/lib/portal/route-errors"
import { isValidDateString } from "@/lib/portal/tz"
import { loadByToken } from "@/lib/portal/booking-token"

const querySchema = z.object({ date: z.string().refine(isValidDateString, "date must be YYYY-MM-DD") })

// Token-authenticated: times this customer could move their booking to on one day.
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await props.params
    const parsed = querySchema.safeParse({ date: new URL(req.url).searchParams.get("date") })
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

    const booking = await loadByToken(token)
    const ctx = await loadRescheduleContext(booking)
    if (!ctx || !["PENDING", "CONFIRMED"].includes(booking.status)) throw new BookingError("NOT_ACTIVE", "This booking can't be moved online")

    const slots = await ctx.slotsFor(parsed.data.date)
    return NextResponse.json(
      { date: parsed.data.date, slots: slots.map((s) => ({ start: s.start.toISOString(), label: s.label })) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    return handleRouteError(err, "Booking manage slots")
  }
}
