// DVLA Vehicle Enquiry Service (https://developer-portal.driver-vehicle-licensing.api.gov.uk). A free API key from DVLA
// goes in the super admin's Settings screen or, failing that, VEHICLE_LOOKUP_API_KEY. It is the fallback when DVSA has
// no MOT history for a vehicle (e.g. a new car): it gives make, fuel, colour and year but, unlike DVSA, no model.
// Never throws.

import { normaliseVrm } from "@/lib/portal/vrm"
import type { LookupResult, MotVehicle } from "@/lib/mot-history"
import { toIsoDate } from "@/lib/mot-history"
import { getSetting } from "@/lib/platform-settings"

const DEFAULT_URL = "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles"

export const dvlaConfigured = async (): Promise<boolean> => Boolean(await getSetting("VEHICLE_LOOKUP_API_KEY"))

const titleCase = (s: unknown) =>
  typeof s === "string" && s.trim() ? s.trim().toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()) : null

export async function lookupDvla(registration: string): Promise<LookupResult> {
  const apiKey = await getSetting("VEHICLE_LOOKUP_API_KEY")
  if (!apiKey) return { ok: false, reason: "UNAVAILABLE" }
  const reg = normaliseVrm(registration)
  if (!reg) return { ok: false, reason: "NOT_FOUND" }
  try {
    const res = await fetch(process.env.DVLA_VES_URL ?? DEFAULT_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ registrationNumber: reg }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "NOT_FOUND" }
    if (!res.ok) throw new Error(`DVLA lookup failed (${res.status})`)
    const v = (await res.json()) as Record<string, unknown>
    const year = typeof v.yearOfManufacture === "number" ? v.yearOfManufacture : null
    const vehicle: MotVehicle = {
      registration: reg,
      make: titleCase(v.make),
      model: null,
      fuel: titleCase(v.fuelType),
      colour: titleCase(v.colour),
      year,
      motExpiry: toIsoDate(v.motExpiryDate),
      latestMileage: null,
      tests: [],
    }
    return { ok: true, vehicle }
  } catch (err) {
    console.error("[dvla-ves] lookup failed:", (err as Error).message)
    return { ok: false, reason: "ERROR" }
  }
}
