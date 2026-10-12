import { NextResponse } from "next/server"
import { advisoryDescription, lookupMotHistory, motHistoryConfigured } from "@/lib/mot-history"
import { dvlaConfigured, lookupDvla } from "@/lib/dvla-ves"
import { isPlausibleVrm } from "@/lib/portal/vrm"
import { limitByIp } from "@/lib/rate-limit"

// Public (the guest "post a job" form uses it), so it is rate limited per IP: every call is a metered DVSA request.
export async function GET(req: Request) {
  if (!motHistoryConfigured() && !dvlaConfigured()) return NextResponse.json({ available: false })

  const reg = new URL(req.url).searchParams.get("reg") ?? ""
  if (!reg) return NextResponse.json({ available: true }) // lets the form check whether to show a lookup button at all
  if (!isPlausibleVrm(reg)) return NextResponse.json({ error: "Enter a valid registration" }, { status: 400 })

  const limited = await limitByIp(req.headers, "vehicle-lookup", 20, 10 * 60_000)
  if (limited) return limited

  // DVSA first (it has the model); DVLA covers vehicles with no MOT history yet, or DVSA being down.
  let result = await lookupMotHistory(reg)
  if (!result.ok && dvlaConfigured()) {
    const fallback = await lookupDvla(reg)
    if (fallback.ok || result.reason === "UNAVAILABLE" || fallback.reason === "NOT_FOUND") result = fallback
  }
  if (!result.ok) {
    if (result.reason === "UNAVAILABLE") return NextResponse.json({ available: false })
    if (result.reason === "NOT_FOUND") return NextResponse.json({ available: true, found: false })
    return NextResponse.json({ error: "Vehicle lookup is unavailable right now — you can fill the details in yourself." }, { status: 502 })
  }
  const v = result.vehicle
  return NextResponse.json({
    available: true,
    found: true,
    vehicle: {
      registration: v.registration,
      make: v.make,
      model: v.model,
      year: v.year,
      fuel: v.fuel,
      colour: v.colour,
      motExpiry: v.motExpiry,
      mileage: v.latestMileage,
    },
    recentTests: v.tests.slice(0, 3),
    adviceDescription: advisoryDescription(v),
  })
}
