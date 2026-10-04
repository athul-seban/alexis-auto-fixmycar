import { normaliseVrm } from "@/lib/portal/vrm"
import { normalisePhone } from "@/lib/portal/phone"

// `Booking.searchText` is a lower-cased concatenation we query with `contains`. Prisma's
// `mode: "insensitive"` doesn't exist on the SQLite client, so this keeps search behaviour
// identical on SQLite (local/CI) and Postgres (prod).

export interface SearchTextInput {
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  vrm?: string | null
  vehicleMake?: string | null
  vehicleModel?: string | null
  reference?: string | null
}

export function buildSearchText(i: SearchTextInput): string {
  return [
    i.customerName,
    i.customerEmail,
    normalisePhone(i.customerPhone),
    normaliseVrm(i.vrm),
    i.vehicleMake,
    i.vehicleModel,
    i.reference,
  ]
    .filter((p): p is string => !!p)
    .join(" ")
    .toLowerCase()
}

/** What to feed into `contains` for a free-text search box. */
export function normaliseSearchQuery(q: string): string {
  const t = q.trim().toLowerCase()
  // A phone-looking query (digits/+/spaces) is matched against the normalised phone.
  if (/^[+\d][\d\s\-()+]{4,}$/.test(t)) return normalisePhone(t)
  return t
}
