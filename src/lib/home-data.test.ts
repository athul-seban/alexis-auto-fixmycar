import { describe, expect, it } from "vitest"
import { displayName, responseLabel } from "./home-data"

describe("displayName", () => {
  it("shows first name and last initial only", () => {
    expect(displayName("Sarah Mitchell")).toBe("Sarah M.")
    expect(displayName("  anna  maria  de la cruz ")).toBe("anna C.")
    expect(displayName("Cher")).toBe("Cher")
    expect(displayName(null)).toBe("A customer")
    expect(displayName("   ")).toBe("A customer")
  })
})

describe("responseLabel", () => {
  it("is null without a measurement and rounds up otherwise", () => {
    expect(responseLabel(null)).toBeNull()
    expect(responseLabel(0)).toBeNull()
    expect(responseLabel(20)).toBe("< 1 hour")
    expect(responseLabel(90)).toBe("< 2 hours")
    expect(responseLabel(60 * 30)).toBe("< 2 days")
  })
})
