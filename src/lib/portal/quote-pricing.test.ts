import { describe, expect, it } from "vitest"
import { estimateQuote, fixedItems, instantQuote, parseWorks, resolveManualItems, respondDeadline, sumItems } from "./quote-pricing"

const row = (serviceType: string, over: object = {}) => ({ serviceType, isActive: true, autoQuote: false, fixedPrice: null, priceFrom: null, ...over })

describe("parseWorks", () => {
  it("reads the list, drops unknown codes and duplicates, falls back to the single service", () => {
    expect(parseWorks('["MOT","BRAKES","MOT","NOPE"]', "MOT")).toEqual(["MOT", "BRAKES"])
    expect(parseWorks("[]", "TYRES")).toEqual(["TYRES"])
    expect(parseWorks("not json", "TYRES")).toEqual(["TYRES"])
  })
})

describe("instant quotes", () => {
  const prices = [row("MOT", { autoQuote: true, fixedPrice: 45 }), row("BRAKES", { autoQuote: true, fixedPrice: 120.5 }), row("TYRES", { fixedPrice: 60 })]
  it("answers instantly only when every work has a fixed price with auto-quote on", () => {
    expect(instantQuote(["MOT", "BRAKES"], prices)).toEqual([
      { serviceType: "MOT", price: 45, source: "FIXED" },
      { serviceType: "BRAKES", price: 120.5, source: "FIXED" },
    ])
    expect(sumItems(instantQuote(["MOT", "BRAKES"], prices)!)).toBe(165.5)
    expect(instantQuote(["MOT", "TYRES"], prices)).toBeNull() // TYRES has a price but auto-quote is off
    expect(instantQuote([], prices)).toBeNull()
  })
  it("ignores a work the garage has switched off", () => {
    expect(fixedItems(["MOT"], [row("MOT", { isActive: false, autoQuote: true, fixedPrice: 45 })])).toEqual([])
  })
})

describe("estimateQuote", () => {
  it("uses the fixed price, else the from price, and gives up if any work has no price", () => {
    const prices = [row("MOT", { fixedPrice: 45 }), row("BRAKES", { priceFrom: 80 })]
    expect(estimateQuote(["MOT", "BRAKES"], prices)?.map((i) => i.price)).toEqual([45, 80])
    expect(estimateQuote(["MOT", "CLUTCH"], prices)).toBeNull()
  })
})

describe("resolveManualItems", () => {
  it("needs exactly one positive amount per requested work", () => {
    expect(resolveManualItems(["MOT", "BRAKES"], [{ serviceType: "MOT", price: 40 }, { serviceType: "BRAKES", price: 99.999 }])).toEqual([
      { serviceType: "MOT", price: 40, source: "MANUAL" },
      { serviceType: "BRAKES", price: 100, source: "MANUAL" },
    ])
    expect(resolveManualItems(["MOT", "BRAKES"], [{ serviceType: "MOT", price: 40 }])).toHaveProperty("error")
    expect(resolveManualItems(["MOT"], [{ serviceType: "MOT", price: 40 }, { serviceType: "TYRES", price: 5 }])).toHaveProperty("error")
    expect(resolveManualItems(["MOT"], [{ serviceType: "MOT", price: 0 }])).toHaveProperty("error")
  })
})

describe("respondDeadline", () => {
  it("adds the garage's response hours", () => {
    expect(respondDeadline(new Date("2026-10-14T10:00:00Z"), 24).toISOString()).toBe("2026-10-15T10:00:00.000Z")
  })
})
