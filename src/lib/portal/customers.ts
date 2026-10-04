import { normalisePhone } from "@/lib/portal/phone"
import { normaliseVrm } from "@/lib/portal/vrm"

// The garage "customer list" is derived from bookings: there is no Customer table (see CLAUDE.md). People are
// grouped by the best identity a booking carries — email, else phone, else registration — so a returning customer
// who booked once on the widget and once by phone is one row as long as they gave the same email or number.

export interface CustomerBookingRow {
  id: string
  status: string
  scheduledAt: Date
  totalPrice: number
  finalInvoiceValue: number | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  vrm: string | null
  vehicleMake: string | null
  vehicleModel: string | null
}

export interface CustomerVehicle {
  vrm: string
  label: string
}

export interface Customer {
  key: string
  name: string
  email: string | null
  phone: string | null
  vehicles: CustomerVehicle[]
  /** Every booking that wasn't cancelled. */
  bookings: number
  completed: number
  noShows: number
  cancelled: number
  /** Sum of completed jobs: final invoice value if known, else the quoted price. */
  spend: number
  lastVisit: Date | null
  nextBooking: Date | null
}

/** The identity a booking is grouped under, or a per-booking key when it carries no contact details at all. */
export function customerKey(b: Pick<CustomerBookingRow, "id" | "customerEmail" | "customerPhone" | "vrm">): string {
  const email = b.customerEmail?.trim().toLowerCase()
  if (email) return `e:${email}`
  const phone = normalisePhone(b.customerPhone)
  if (phone) return `p:${phone}`
  const vrm = normaliseVrm(b.vrm)
  if (vrm) return `v:${vrm}`
  return `u:${b.id}`
}

const ACTIVE = ["PENDING", "CONFIRMED", "IN_PROGRESS"]

export function buildCustomers(rows: CustomerBookingRow[], now: Date = new Date()): Customer[] {
  const byKey = new Map<string, CustomerBookingRow[]>()
  for (const r of rows) {
    const k = customerKey(r)
    const list = byKey.get(k)
    if (list) list.push(r)
    else byKey.set(k, [r])
  }

  const out: Customer[] = []
  for (const [key, list] of byKey) {
    // Newest first so the most recent name/contact wins when they changed.
    const newest = [...list].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    const pick = <T>(f: (r: CustomerBookingRow) => T | null | undefined): T | null => {
      for (const r of newest) {
        const v = f(r)
        if (v) return v
      }
      return null
    }

    const vehicles = new Map<string, CustomerVehicle>()
    for (const r of newest) {
      const vrm = normaliseVrm(r.vrm)
      if (vrm && !vehicles.has(vrm)) vehicles.set(vrm, { vrm, label: [r.vehicleMake, r.vehicleModel].filter(Boolean).join(" ") })
    }

    const live = list.filter((r) => r.status !== "CANCELLED")
    const completed = list.filter((r) => r.status === "COMPLETED")
    const future = list.filter((r) => ACTIVE.includes(r.status) && r.scheduledAt.getTime() > now.getTime())

    out.push({
      key,
      name: pick((r) => r.customerName?.trim()) ?? "Unknown customer",
      email: pick((r) => r.customerEmail?.trim().toLowerCase()),
      phone: pick((r) => (r.customerPhone ? normalisePhone(r.customerPhone) : null)),
      vehicles: [...vehicles.values()],
      bookings: live.length,
      completed: completed.length,
      noShows: list.filter((r) => r.status === "NO_SHOW").length,
      cancelled: list.filter((r) => r.status === "CANCELLED").length,
      spend: Math.round(completed.reduce((sum, r) => sum + (r.finalInvoiceValue ?? r.totalPrice), 0) * 100) / 100,
      lastVisit: completed.length ? new Date(Math.max(...completed.map((r) => r.scheduledAt.getTime()))) : null,
      nextBooking: future.length ? new Date(Math.min(...future.map((r) => r.scheduledAt.getTime()))) : null,
    })
  }
  return out
}

export type CustomerSort = "name" | "bookings" | "spend" | "lastVisit"
export const CUSTOMER_SORTS: CustomerSort[] = ["name", "bookings", "spend", "lastVisit"]

export function searchCustomers(customers: Customer[], q: string | undefined): Customer[] {
  const term = q?.trim().toLowerCase()
  if (!term) return customers
  const digits = normalisePhone(term)
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (c.email ?? "").includes(term) ||
      (digits.length >= 4 && (c.phone ?? "").includes(digits)) ||
      c.vehicles.some((v) => v.vrm.toLowerCase().includes(term.replace(/\s/g, "")))
  )
}

export function sortCustomers(customers: Customer[], sort: CustomerSort, dir: "asc" | "desc"): Customer[] {
  const sign = dir === "asc" ? 1 : -1
  const time = (d: Date | null) => (d ? d.getTime() : -Infinity)
  return [...customers].sort((a, b) => {
    let diff = 0
    if (sort === "name") diff = a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    else if (sort === "bookings") diff = a.bookings - b.bookings
    else if (sort === "spend") diff = a.spend - b.spend
    else diff = time(a.lastVisit) - time(b.lastVisit)
    // Stable, deterministic tie-break so pages don't shuffle between requests.
    return diff !== 0 ? diff * sign : a.key.localeCompare(b.key)
  })
}
