import { NextResponse } from "next/server"
import { z } from "zod"
import { BookingError } from "@/lib/portal/booking-error"

/** Maps the errors routes can throw onto JSON responses (400 zod, typed BookingError, else 500). */
export function handleRouteError(err: unknown, label: string): NextResponse {
  if (err instanceof BookingError) {
    return NextResponse.json({ error: err.message, code: err.code, ...(err.details ?? {}) }, { status: err.status })
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
  }
  console.error(`${label} error:`, err)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}
