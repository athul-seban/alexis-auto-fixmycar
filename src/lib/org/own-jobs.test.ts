import { describe, expect, it } from "vitest"
import { disallowedOwnJobFields, scopeAllows, scopeWhere } from "./own-jobs"

describe("scopeWhere", () => {
  it("adds no filter for someone who sees everything", () => {
    expect(scopeWhere({ kind: "all" })).toEqual({})
  })

  it("filters to the linked technician's jobs", () => {
    expect(scopeWhere({ kind: "own", technicianId: "t1" })).toEqual({ technicianId: "t1" })
  })

  it("matches nothing, never everything, when there is no link or no booking access at all", () => {
    expect(scopeWhere({ kind: "own", technicianId: null })).toEqual({ technicianId: "__no_technician__" })
    expect(scopeWhere(null)).toEqual({ id: "__no_technician__" })
  })
})

describe("scopeAllows", () => {
  it("lets 'all' touch anything, 'own' only a booking assigned to them, and an unlinked login nothing", () => {
    expect(scopeAllows({ kind: "all" }, null)).toBe(true)
    expect(scopeAllows({ kind: "own", technicianId: "t1" }, "t1")).toBe(true)
    expect(scopeAllows({ kind: "own", technicianId: "t1" }, "t2")).toBe(false)
    expect(scopeAllows({ kind: "own", technicianId: "t1" }, null)).toBe(false)
    expect(scopeAllows({ kind: "own", technicianId: null }, null)).toBe(false)
  })
})

describe("disallowedOwnJobFields", () => {
  it("accepts recording an outcome and notes", () => {
    expect(disallowedOwnJobFields({ status: "IN_PROGRESS" })).toEqual([])
    expect(disallowedOwnJobFields({ status: "COMPLETED", notes: "done" })).toEqual([])
    expect(disallowedOwnJobFields({ notes: "waiting for parts" })).toEqual([])
  })

  it("names everything else, including statuses a technician may not set", () => {
    expect(disallowedOwnJobFields({ status: "CANCELLED" })).toEqual(["status:CANCELLED"])
    expect(disallowedOwnJobFields({ status: "CONFIRMED" })).toEqual(["status:CONFIRMED"])
    expect(disallowedOwnJobFields({ technicianId: "t2", totalPrice: 1, scheduledAt: "x" }).sort()).toEqual(["scheduledAt", "technicianId", "totalPrice"])
    expect(disallowedOwnJobFields({ status: "COMPLETED", finalInvoiceValue: 10 })).toEqual(["finalInvoiceValue"])
  })
})
