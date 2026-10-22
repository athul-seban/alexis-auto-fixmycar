import { describe, expect, it } from "vitest"
import { isReadOnlyLocation, readOnlyReason } from "./location-status"

describe("readOnlyReason", () => {
  it("lets a pending or live location be written to", () => {
    expect(readOnlyReason("PENDING")).toBeNull()
    expect(readOnlyReason("APPROVED")).toBeNull()
  })

  it("makes suspended and archived locations read-only, with different codes the UI can act on", () => {
    expect(readOnlyReason("SUSPENDED")?.code).toBe("GARAGE_SUSPENDED")
    expect(readOnlyReason("ARCHIVED")?.code).toBe("LOCATION_ARCHIVED")
  })

  it("fails closed: a status nobody has handled yet is read-only", () => {
    expect(isReadOnlyLocation("SOMETHING_NEW")).toBe(true)
    expect(isReadOnlyLocation("")).toBe(true)
    expect(readOnlyReason("SOMETHING_NEW")?.code).toBe("LOCATION_READ_ONLY")
  })
})
