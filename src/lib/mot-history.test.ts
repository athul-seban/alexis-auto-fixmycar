import { describe, expect, it } from "vitest"
import { advisoryDescription, normaliseMotHistory, toIsoDate } from "./mot-history"

const sample = {
  registration: "AB12CDE",
  make: "FORD",
  model: "FOCUS ZETEC",
  fuelType: "Petrol",
  primaryColour: "BLUE",
  firstUsedDate: "2012-03-01",
  motTests: [
    {
      completedDate: "2022-03-10 09:00:00",
      testResult: "PASSED",
      expiryDate: "2023-03-09",
      odometerValue: "61000",
      odometerUnit: "MI",
      defects: [{ text: "Tyre worn close to legal limit", type: "ADVISORY" }],
    },
    {
      completedDate: "2023-03-02T10:00:00.000Z",
      testResult: "PASSED",
      expiryDate: "2024-03-01",
      odometerValue: 66500,
      odometerUnit: "MI",
      defects: [
        { text: "Brake pad worn", type: "ADVISORY" },
        { text: "Headlamp aim", type: "ADVISORY" },
      ],
    },
    {
      completedDate: "2021-03-05",
      testResult: "FAILED",
      odometerValue: 55000,
      odometerUnit: "MI",
      defects: [{ text: "Brake disc excessively worn", type: "MAJOR" }],
    },
  ],
}

describe("toIsoDate", () => {
  it("accepts the formats DVSA is documented to use", () => {
    expect(toIsoDate("2023-11-03")).toBe("2023-11-03")
    expect(toIsoDate("2023-11-03T10:12:00.000Z")).toBe("2023-11-03")
    expect(toIsoDate("2023-11-03 10:12:00")).toBe("2023-11-03")
    expect(toIsoDate("2023.11.03")).toBe("2023-11-03")
  })
  it("rejects nonsense", () => {
    expect(toIsoDate("2023-13-40")).toBeNull()
    expect(toIsoDate("yesterday")).toBeNull()
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(20231103)).toBeNull()
  })
})

describe("normaliseMotHistory", () => {
  const v = normaliseMotHistory(sample)
  it("tidies the vehicle details", () => {
    expect(v).toMatchObject({ registration: "AB12CDE", make: "Ford", model: "Focus Zetec", fuel: "Petrol", colour: "Blue", year: 2012 })
  })
  it("sorts tests newest first and takes the expiry from the latest pass", () => {
    expect(v.tests.map((t) => t.date)).toEqual(["2023-03-02", "2022-03-10", "2021-03-05"])
    expect(v.motExpiry).toBe("2024-03-01")
    expect(v.latestMileage).toBe(66500)
  })
  it("separates advisories from failures", () => {
    expect(v.tests[0].advisories).toEqual(["Brake pad worn", "Headlamp aim"])
    expect(v.tests[2]).toMatchObject({ result: "FAILED", failures: ["Brake disc excessively worn"], advisories: [] })
  })
  it("survives missing and malformed data", () => {
    expect(normaliseMotHistory(null, "xx 99")).toMatchObject({ registration: "XX99", make: null, tests: [], motExpiry: null })
    expect(normaliseMotHistory({ motTests: [null, 5, { testResult: "WEIRD" }] }).tests).toHaveLength(3)
  })
})

describe("advisoryDescription", () => {
  it("summarises the latest test that had something to say", () => {
    expect(advisoryDescription(normaliseMotHistory(sample))).toBe("From the last MOT (2023-03-02): Brake pad worn (advisory); Headlamp aim (advisory).")
  })
  it("is empty when there is nothing to report", () => {
    expect(advisoryDescription(normaliseMotHistory({ motTests: [{ completedDate: "2024-01-01", testResult: "PASSED" }] }))).toBe("")
  })
})
