import { NextResponse } from "next/server"
import { parseOpeningHours } from "@/lib/garage-mapper"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { loadWidgetGarage } from "@/lib/portal/widget-service"
import { limitByIp } from "@/lib/rate-limit"

type Params = { slug: string }

// Public (no auth): the widget's configuration. 404 unless the garage is live and has the widget on.
export async function GET(req: Request, props: { params: Promise<Params> }) {
  const { slug } = await props.params
  const limited = await limitByIp(req.headers, "widget-config", 120, 60_000)
  if (limited) return limited
  try {
    const w = await loadWidgetGarage(slug)
    if (!w) return NextResponse.json({ error: "Booking isn't available for this garage" }, { status: 404 })

    return NextResponse.json(
      {
        garage: { name: w.garage.name, logo: w.garage.logo, phone: w.garage.phone, city: w.garage.city, address: w.garage.address, postcode: w.garage.postcode },
        settings: {
          accent: w.settings.accent,
          leadHours: w.settings.leadHours,
          maxDaysAhead: w.settings.maxDaysAhead,
          slotMins: w.settings.slotMins,
          autoConfirm: w.settings.autoConfirm,
          successMessage: w.settings.successMessage,
          // Only offer "text me" when this garage has switched texting on.
          smsAvailable: parsePortalSettings(w.garage.portalSettings).notifications.smsCustomer,
        },
        // Without opening hours there's nothing to offer, so the widget can say "call us" instead.
        hoursConfigured: parseOpeningHours(w.garage.openingHours) !== null,
        services: w.services,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    console.error("Widget config GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
