import { describe, expect, it } from "vitest"
import { cleanFileName, isDocumentKind } from "./garage-documents"

describe("cleanFileName", () => {
  it("drops path parts and unsafe characters", () => {
    expect(cleanFileName("C:\\Users\\me\\insurance.pdf")).toBe("insurance.pdf")
    expect(cleanFileName("../../etc/passwd")).toBe("passwd")
    expect(cleanFileName('a<b>"c|.pdf')).toBe("abc.pdf")
  })
  it("falls back when nothing is left, and caps the length", () => {
    expect(cleanFileName("???")).toBe("document")
    expect(cleanFileName("x".repeat(500))).toHaveLength(120)
  })
})

describe("isDocumentKind", () => {
  it("accepts the known kinds only", () => {
    expect(isDocumentKind("INSURANCE")).toBe(true)
    expect(isDocumentKind("PASSPORT")).toBe(false)
    expect(isDocumentKind(undefined)).toBe(false)
  })
})
