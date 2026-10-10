import { NextResponse } from "next/server"
import { getPriceGuidance } from "@/lib/price-guidance"

// Public: typical accepted price for a service, optionally narrowed to a city. `guidance` is null until enough
// quotes have been accepted to be meaningful.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const service = sp.get("service")?.trim()
  if (!service || !/^[A-Z_]{2,30}$/.test(service)) return NextResponse.json({ error: "service is required" }, { status: 400 })
  try {
    const city = sp.get("city")?.trim().slice(0, 60) || null
    // Prefer the local figure, fall back to the national one when the city has too little data.
    const guidance = (city ? await getPriceGuidance(service, city) : null) ?? (await getPriceGuidance(service))
    return NextResponse.json({ guidance }, { headers: { "Cache-Control": "public, s-maxage=3600" } })
  } catch (err) {
    console.error("Price guidance error:", err)
    return NextResponse.json({ error: "Couldn't load price guidance" }, { status: 500 })
  }
}
