import { NextResponse } from "next/server"
import { z } from "zod"
import { withGarage } from "@/lib/garage-auth"
import { CSV_MAX_ROWS, toCsv } from "@/lib/portal/csv"
import { buildCustomers, CUSTOMER_SORTS, searchCustomers, sortCustomers, type Customer } from "@/lib/portal/customers"
import { loadCustomerRows } from "@/lib/portal/customers-db"
import { formatPhone } from "@/lib/portal/phone"
import { londonDateString } from "@/lib/portal/tz"

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(CUSTOMER_SORTS as [string, ...string[]]).default("lastVisit"),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50, 100].includes(n), "pageSize must be 10, 25, 50 or 100").default(25),
  format: z.enum(["json", "csv"]).default("json"),
})

const wire = (c: Customer) => ({
  ...c,
  lastVisit: c.lastVisit?.toISOString() ?? null,
  nextBooking: c.nextBooking?.toISOString() ?? null,
})

export const GET = withGarage("Garage customers GET", async (req, { garage }) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const q = querySchema.parse(sp)
  const sort = q.sort as (typeof CUSTOMER_SORTS)[number]
  // Names read A→Z by default; everything else is biggest/most recent first.
  const dir = q.dir ?? (sort === "name" ? "asc" : "desc")

  const all = buildCustomers(await loadCustomerRows(garage.id))
  const matched = sortCustomers(searchCustomers(all, q.q), sort, dir)

  if (q.format === "csv") {
    const rows = matched.slice(0, CSV_MAX_ROWS).map((c) => [
      c.name, c.email ?? "", formatPhone(c.phone), c.vehicles.map((v) => v.vrm).join(" "), c.bookings, c.completed, c.noShows, c.cancelled, c.spend.toFixed(2),
      c.lastVisit ? londonDateString(c.lastVisit) : "", c.nextBooking ? londonDateString(c.nextBooking) : "",
    ])
    const csv = toCsv(["Name", "Email", "Phone", "Vehicles", "Bookings", "Completed", "No-shows", "Cancelled", "Spend (£)", "Last visit", "Next booking"], rows, { bom: true })
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${londonDateString(new Date())}.csv"`, "Cache-Control": "no-store" },
    })
  }

  const total = matched.length
  const start = (q.page - 1) * q.pageSize
  return NextResponse.json({
    customers: matched.slice(start, start + q.pageSize).map(wire),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    // Whole-garage figures for the header (not affected by search).
    summary: { customers: all.length, repeat: all.filter((c) => c.completed >= 2).length, spend: Math.round(all.reduce((s, c) => s + c.spend, 0) * 100) / 100 },
  })
})
