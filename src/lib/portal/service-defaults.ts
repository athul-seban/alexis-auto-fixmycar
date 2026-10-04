import { z } from "zod"
import { SERVICE_TYPES } from "@/lib/constants"

// Typical job lengths, used to prefill a service's duration until the garage sets its own.
export const DEFAULT_SERVICE_DURATION: Record<(typeof SERVICE_TYPES)[number], number> = {
  MOT: 60,
  FULL_SERVICE: 180,
  INTERIM_SERVICE: 120,
  MINOR_SERVICE: 90,
  REPAIR: 120,
  DIAGNOSTICS: 60,
  TYRES: 60,
  BRAKES: 120,
  CLUTCH: 240,
  CAMBELT: 240,
  EXHAUST: 90,
  BATTERY: 30,
  WINDSCREEN: 90,
  AIR_CON: 60,
  ELECTRIC_SERVICE: 120,
  OTHER: 60,
}

export const pricingRowSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    priceFrom: z.number().min(0).max(1_000_000).nullable().optional(),
    priceTo: z.number().min(0).max(1_000_000).nullable().optional(),
    durationMins: z.number().int().min(15).max(960),
    notes: z.string().trim().max(300).nullable().optional(),
    isActive: z.boolean(),
  })
  .refine((r) => r.priceFrom == null || r.priceTo == null || r.priceTo >= r.priceFrom, {
    path: ["priceTo"],
    message: "“Up to” price can't be lower than the “from” price",
  })

export const pricingSchema = z.object({ prices: z.array(pricingRowSchema).min(1).max(SERVICE_TYPES.length) })

/** "£55", "from £55", "£55 – £90" — null when no price is set. */
export function priceLabel(from: number | null, to: number | null): string | null {
  const fmt = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`
  if (from == null && to == null) return null
  if (from != null && to != null && to !== from) return `${fmt(from)} – ${fmt(to)}`
  if (from != null && to == null) return `from ${fmt(from)}`
  return fmt((from ?? to) as number)
}
