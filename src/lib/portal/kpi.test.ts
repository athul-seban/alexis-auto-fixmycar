import { describe, it, expect } from "vitest"
import { computeKpis, computeToday, channelOf, invoiceValue, type KpiRow } from "@/lib/portal/kpi"
import { londonDayRange } from "@/lib/portal/tz"

// Saturday 3 Oct 2026, 12:00 BST.
const NOW = new Date("2026-10-03T11:00:00Z")
const RANGE = londonDayRange("2026-09-20", "2026-10-03")

const row = (o: Partial<KpiRow>): KpiRow => ({
  source: "MARKETPLACE",
  status: "COMPLETED",
  scheduledAt: new Date("2026-09-25T10:00:00Z"),
  createdAt: new Date("2026-09-20T10:00:00Z"),
  totalPrice: 100,
  finalInvoiceValue: null,
  ...o,
})

describe("channelOf", () => {
  it("groups quote and job-request bookings under marketplace", () => {
    expect(channelOf("MARKETPLACE")).toBe("marketplace")
    expect(channelOf("QUOTE")).toBe("marketplace")
    expect(channelOf("JOB_REQUEST")).toBe("marketplace")
    expect(channelOf("WIDGET")).toBe("widget")
    expect(channelOf("DIRECT")).toBe("direct")
    expect(channelOf("SOMETHING_ELSE")).toBe("marketplace")
  })
})

describe("computeKpis", () => {
  it("counts created by createdAt and attended by scheduledAt, per channel", () => {
    const k = computeKpis(
      [
        row({}), // marketplace, completed, in range both ways
        row({ source: "WIDGET" }),
        row({ source: "WIDGET", status: "IN_PROGRESS" }),
        row({ createdAt: new Date("2026-08-01T10:00:00Z") }), // created outside range, scheduled inside
        row({ scheduledAt: new Date("2026-11-01T10:00:00Z"), status: "CONFIRMED" }), // created inside, not attended
      ],
      RANGE
    )
    // Created in range: rows 1 and 5 (row 4 was created outside the range).
    expect(k.marketplace.created).toBe(2)
    // Attended in range: rows 1 and 4 (row 5 is only CONFIRMED and scheduled outside).
    expect(k.marketplace.attended).toBe(2)
    expect(k.widget.created).toBe(2)
    expect(k.widget.attended).toBe(2)
  })

  it("sums FIV over COMPLETED only, preferring finalInvoiceValue over totalPrice", () => {
    const k = computeKpis(
      [
        row({ totalPrice: 100, finalInvoiceValue: 130.5 }),
        row({ totalPrice: 80 }),
        row({ status: "IN_PROGRESS", totalPrice: 999 }),
        row({ status: "CANCELLED", totalPrice: 999 }),
        row({ source: "WIDGET", totalPrice: 60 }),
      ],
      RANGE
    )
    expect(k.marketplace.fiv).toBe(210.5)
    expect(k.widget.fiv).toBe(60)
  })

  it("computes the no-show rate over attended + no-shows, null when there are none", () => {
    const rows = [row({}), row({}), row({}), row({ status: "NO_SHOW" })]
    expect(computeKpis(rows, RANGE).noShowRate).toBe(25)
    expect(computeKpis([row({ status: "CONFIRMED" })], RANGE).noShowRate).toBeNull()
    expect(computeKpis([], RANGE).noShowRate).toBeNull()
  })

  it("keeps direct bookings out of marketplace and widget", () => {
    const k = computeKpis([row({ source: "DIRECT" })], RANGE)
    expect(k.direct.attended).toBe(1)
    expect(k.marketplace.attended).toBe(0)
    expect(k.widget.attended).toBe(0)
  })

  it("treats the range as half-open on the London day boundary", () => {
    // 23:30 UTC on 3 Oct is 00:30 BST on 4 Oct → outside a range ending 3 Oct.
    const k = computeKpis([row({ scheduledAt: new Date("2026-10-03T23:30:00Z") })], RANGE)
    expect(k.marketplace.attended).toBe(0)
    const inside = computeKpis([row({ scheduledAt: new Date("2026-10-03T22:30:00Z") })], RANGE)
    expect(inside.marketplace.attended).toBe(1)
  })
})

describe("computeToday", () => {
  it("counts due-today (excluding cancelled/no-show) and created-today in London time", () => {
    const t = computeToday(
      [
        row({ status: "CONFIRMED", scheduledAt: new Date("2026-10-03T13:00:00Z") }),
        row({ status: "PENDING", scheduledAt: new Date("2026-10-03T15:00:00Z") }),
        row({ status: "CANCELLED", scheduledAt: new Date("2026-10-03T15:00:00Z") }),
        row({ status: "NO_SHOW", scheduledAt: new Date("2026-10-03T09:00:00Z") }),
        row({ status: "CONFIRMED", scheduledAt: new Date("2026-10-04T10:00:00Z") }),
        row({ createdAt: new Date("2026-10-02T23:30:00Z") }), // 00:30 BST today
        row({ createdAt: new Date("2026-10-02T22:30:00Z") }), // 23:30 BST yesterday
      ],
      NOW
    )
    expect(t.dueToday).toBe(2)
    expect(t.createdToday).toBe(1)
  })

  it("counts past pending/confirmed bookings as needing an outcome", () => {
    const t = computeToday(
      [
        row({ status: "CONFIRMED", scheduledAt: new Date("2026-10-01T10:00:00Z") }),
        row({ status: "PENDING", scheduledAt: new Date("2026-10-02T10:00:00Z") }),
        row({ status: "COMPLETED", scheduledAt: new Date("2026-10-01T10:00:00Z") }),
        row({ status: "CONFIRMED", scheduledAt: new Date("2026-10-10T10:00:00Z") }),
      ],
      NOW
    )
    expect(t.needsOutcome).toBe(2)
  })
})

describe("invoiceValue", () => {
  it("falls back to totalPrice only when finalInvoiceValue is null/undefined (0 is a real value)", () => {
    expect(invoiceValue({ totalPrice: 100, finalInvoiceValue: 0 })).toBe(0)
    expect(invoiceValue({ totalPrice: 100, finalInvoiceValue: null })).toBe(100)
    expect(invoiceValue({ totalPrice: 100 })).toBe(100)
  })
})
