import { describe, expect, it } from "vitest"
import { responseTimeLabel } from "./response-time"

describe("responseTimeLabel", () => {
  it("says nothing when there is no history, rather than guessing", () => {
    expect(responseTimeLabel(null)).toBeNull()
    expect(responseTimeLabel(undefined)).toBeNull()
  })
  it("buckets the average honestly", () => {
    expect(responseTimeLabel(20)).toBe("Usually responds within 1 hour")
    expect(responseTimeLabel(120)).toBe("Usually responds within a few hours")
    expect(responseTimeLabel(600)).toBe("Usually responds within a day")
    expect(responseTimeLabel(5000)).toBe("Usually responds within a few days")
  })
})
