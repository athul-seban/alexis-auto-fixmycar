import { describe, it, expect } from "vitest"
import { csvCell, toCsv } from "@/lib/portal/csv"

describe("csvCell — formula injection", () => {
  it.each(["=SUM(A1)", "+44 7700 900123", "-2+3", "@cmd", "\tx", "\rx"])(
    "prefixes %j with an apostrophe",
    (cell) => {
      expect(csvCell(cell).replace(/^"|"$/g, "").startsWith("'")).toBe(true)
    }
  )

  it("does not prefix ordinary text or numbers (including negatives)", () => {
    expect(csvCell("Bradley Jarvis")).toBe("Bradley Jarvis")
    expect(csvCell(-12.5)).toBe("-12.5")
    expect(csvCell(0)).toBe("0")
  })
})

describe("csvCell — quoting", () => {
  it("quotes commas, quotes and newlines, doubling embedded quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"')
  })

  it("quotes after applying the formula guard", () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`)
  })

  it("renders null/undefined/NaN as empty, booleans and dates sensibly", () => {
    expect(csvCell(null)).toBe("")
    expect(csvCell(undefined)).toBe("")
    expect(csvCell(NaN)).toBe("")
    expect(csvCell(true)).toBe("TRUE")
    expect(csvCell(new Date("2026-10-03T10:00:00Z"))).toBe("2026-10-03T10:00:00.000Z")
  })
})

describe("toCsv", () => {
  it("joins with CRLF and ends with a newline", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [2, "y"]])).toBe("a,b\r\n1,x\r\n2,y\r\n")
  })

  it("optionally prepends a UTF-8 BOM so Excel reads accents correctly", () => {
    expect(toCsv(["a"], [], { bom: true }).startsWith("﻿")).toBe(true)
  })
})
