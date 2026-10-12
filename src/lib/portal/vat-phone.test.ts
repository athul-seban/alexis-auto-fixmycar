import { describe, expect, it } from "vitest"
import { formatVat, isValidUkVat } from "@/lib/portal/vat"
import { isValidUkMobile, isValidUkPhone } from "@/lib/portal/phone"

describe("isValidUkVat", () => {
  it("accepts the UK shapes, with or without GB and spacing", () => {
    for (const ok of ["GB123456789", "gb 123 4567 89", "123456789", "GB123456789012", "GBGD001", "HA599"]) expect(isValidUkVat(ok)).toBe(true)
  })
  it("rejects malformed numbers", () => {
    for (const bad of ["", "GB12345", "GB1234567890", "FR12345678901", "GB12345678X", "abc"]) expect(isValidUkVat(bad)).toBe(false)
  })
  it("stores with a GB prefix", () => {
    expect(formatVat("123 4567 89")).toBe("GB123456789")
    expect(formatVat("gb123456789")).toBe("GB123456789")
    expect(formatVat("")).toBe("")
  })
})

describe("UK phone validation", () => {
  it("mobiles", () => {
    for (const ok of ["07700 900123", "+44 7700 900123", "0044-7700-900123"]) expect(isValidUkMobile(ok)).toBe(true)
    for (const bad of ["020 7946 0000", "07700 90012", "1234567890", ""]) expect(isValidUkMobile(bad)).toBe(false)
  })
  it("any UK number", () => {
    for (const ok of ["020 7123 4567", "01632 960001", "07700 900123", "+44 20 7123 4567"]) expect(isValidUkPhone(ok)).toBe(true)
    for (const bad of ["12345", "0000000000", "abcdefghij", ""]) expect(isValidUkPhone(bad)).toBe(false)
  })
})
