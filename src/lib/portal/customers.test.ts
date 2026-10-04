import { describe, expect, it } from "vitest"
import { buildCustomers, customerKey, searchCustomers, sortCustomers, type CustomerBookingRow } from "@/lib/portal/customers"

const now = new Date("2026-10-10T12:00:00Z")
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
let id = 0
const row = (o: Partial<CustomerBookingRow> = {}): CustomerBookingRow => ({
  id: `b${++id}`, status: "COMPLETED", scheduledAt: day(-10), totalPrice: 100, finalInvoiceValue: null,
  customerName: "Ann Lee", customerEmail: "ann@example.com", customerPhone: "07700 900123", vrm: "AB12CDE", vehicleMake: "Ford", vehicleModel: "Focus", ...o,
})

describe("customerKey", () => {
  it("prefers email, then phone, then registration, else keeps the booking separate", () => {
    expect(customerKey({ id: "x", customerEmail: " Ann@Example.com ", customerPhone: "07700900123", vrm: "AB12CDE" })).toBe("e:ann@example.com")
    expect(customerKey({ id: "x", customerEmail: null, customerPhone: "+44 7700 900123", vrm: null })).toBe("p:07700900123")
    expect(customerKey({ id: "x", customerEmail: "", customerPhone: null, vrm: "ab12 cde" })).toBe("v:AB12CDE")
    expect(customerKey({ id: "x", customerEmail: null, customerPhone: null, vrm: null })).toBe("u:x")
  })
})

describe("buildCustomers", () => {
  it("groups one person's bookings across sources and totals them", () => {
    const [c, ...rest] = buildCustomers([
      row({ scheduledAt: day(-60), totalPrice: 80 }),
      row({ scheduledAt: day(-5), totalPrice: 120, finalInvoiceValue: 150 }), // final value beats the quote
      row({ status: "CANCELLED", scheduledAt: day(-30) }),
      row({ status: "NO_SHOW", scheduledAt: day(-20) }),
      row({ status: "CONFIRMED", scheduledAt: day(7) }),
      row({ status: "CONFIRMED", scheduledAt: day(3) }),
    ], now)
    expect(rest).toHaveLength(0)
    expect(c).toMatchObject({ key: "e:ann@example.com", name: "Ann Lee", completed: 2, noShows: 1, cancelled: 1, bookings: 5, spend: 230 })
    expect(c.lastVisit).toEqual(day(-5))
    expect(c.nextBooking).toEqual(day(3))
    expect(c.phone).toBe("07700900123")
  })

  it("uses the most recent name and lists each vehicle once", () => {
    const [c] = buildCustomers([
      row({ customerName: "A. Lee", scheduledAt: day(-50) }),
      row({ customerName: "Ann Lee-Smith", scheduledAt: day(-2), vrm: "ZZ99 ZZZ", vehicleMake: "Kia", vehicleModel: "Ceed" }),
      row({ scheduledAt: day(-40) }),
    ], now)
    expect(c.name).toBe("Ann Lee-Smith")
    expect(c.vehicles.map((v) => v.vrm).sort()).toEqual(["AB12CDE", "ZZ99ZZZ"])
  })

  it("keeps different people apart and never merges contact-less bookings", () => {
    const list = buildCustomers([row(), row({ customerEmail: "bob@example.com", customerName: "Bob", customerPhone: null, vrm: "CD34EFG" }), row({ customerEmail: null, customerPhone: null, vrm: null, customerName: null }), row({ customerEmail: null, customerPhone: null, vrm: null, customerName: null })], now)
    expect(list).toHaveLength(4)
    expect(list.filter((c) => c.name === "Unknown customer")).toHaveLength(2)
  })

  it("has no last visit until something is completed, and ignores past unfinished bookings as 'next'", () => {
    const [c] = buildCustomers([row({ status: "CONFIRMED", scheduledAt: day(-1) })], now)
    expect(c.lastVisit).toBeNull()
    expect(c.nextBooking).toBeNull()
  })
})

describe("searchCustomers / sortCustomers", () => {
  const customers = buildCustomers([
    row({ customerEmail: "ann@example.com", scheduledAt: day(-5), totalPrice: 50 }),
    row({ customerEmail: "bob@example.com", customerName: "Bob Ray", customerPhone: "07911 123456", vrm: "XY21 ABC", scheduledAt: day(-9), totalPrice: 300 }),
    row({ customerEmail: "bob@example.com", customerName: "Bob Ray", customerPhone: "07911 123456", vrm: "XY21 ABC", scheduledAt: day(-1), totalPrice: 100 }),
  ], now)

  it("searches name, email, phone digits and registration (spaces ignored)", () => {
    expect(searchCustomers(customers, "bob").map((c) => c.name)).toEqual(["Bob Ray"])
    expect(searchCustomers(customers, "07911 123").map((c) => c.name)).toEqual(["Bob Ray"])
    expect(searchCustomers(customers, "xy21 abc")).toHaveLength(1)
    expect(searchCustomers(customers, "nobody")).toHaveLength(0)
    expect(searchCustomers(customers, "  ")).toHaveLength(2)
  })

  it("sorts by each field in either direction", () => {
    expect(sortCustomers(customers, "name", "asc").map((c) => c.name)).toEqual(["Ann Lee", "Bob Ray"])
    expect(sortCustomers(customers, "spend", "desc").map((c) => c.name)).toEqual(["Bob Ray", "Ann Lee"])
    expect(sortCustomers(customers, "bookings", "desc")[0].name).toBe("Bob Ray")
    expect(sortCustomers(customers, "lastVisit", "desc")[0].name).toBe("Bob Ray") // visited yesterday
  })
})
