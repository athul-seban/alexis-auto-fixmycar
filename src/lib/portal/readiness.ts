import { parseImageList, parseOpeningHours, parseServiceList } from "@/lib/garage-mapper"

// Portal-readiness: what an admin checks before approving a garage, so a listing doesn't go live
// with an empty profile or no way to take a booking. "Required" items block a one-click approval
// (the admin can still approve with an explicit override); "recommended" ones are advisory.

export interface ReadinessInput {
  description: string | null
  logo: string | null
  images: string
  phone: string
  email: string
  address: string
  postcode: string
  services: string
  openingHours: string | null
  /** Active ServicePrice rows. */
  priceCount: number
}

export interface ReadinessCheck {
  key: string
  label: string
  ok: boolean
  required: boolean
}

export interface Readiness {
  checks: ReadinessCheck[]
  /** True when every required check passes. */
  ready: boolean
  missingRequired: string[]
}

const MIN_DESCRIPTION = 30

export function garageReadiness(g: ReadinessInput): Readiness {
  const hours = parseOpeningHours(g.openingHours)
  const hasOpenDay = hours ? Object.values(hours).some((d) => d.open) : false

  const checks: ReadinessCheck[] = [
    { key: "description", label: `Description (${MIN_DESCRIPTION}+ characters)`, ok: (g.description ?? "").trim().length >= MIN_DESCRIPTION, required: true },
    { key: "contact", label: "Phone and email", ok: g.phone.trim().length > 0 && g.email.trim().length > 0, required: true },
    { key: "address", label: "Address and postcode", ok: g.address.trim().length > 0 && g.postcode.trim().length > 0, required: true },
    { key: "services", label: "At least one service", ok: parseServiceList(g.services).length > 0, required: true },
    { key: "hours", label: "Opening hours", ok: hasOpenDay, required: true },
    { key: "photos", label: "Logo or photos", ok: Boolean(g.logo) || parseImageList(g.images).length > 0, required: false },
    { key: "pricing", label: "Service prices", ok: g.priceCount > 0, required: false },
  ]
  const missingRequired = checks.filter((c) => c.required && !c.ok).map((c) => c.label)
  return { checks, ready: missingRequired.length === 0, missingRequired }
}
