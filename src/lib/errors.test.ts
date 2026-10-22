import { describe, expect, it } from "vitest"
import { errorCode, errorMessage, isAbortError } from "@/lib/errors"

describe("isAbortError", () => {
  it("recognises a cancelled fetch and nothing else", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true)
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true)
    for (const v of [null, undefined, "AbortError", new Error("x"), { name: "TypeError" }]) expect(isAbortError(v), String(v)).toBe(false)
  })
})

describe("errorCode", () => {
  it("reads a string code off an error-like value", () => {
    expect(errorCode(Object.assign(new Error("x"), { code: "P2002" }))).toBe("P2002")
    expect(errorCode({ code: "P2003" })).toBe("P2003")
  })

  it("is undefined for everything else", () => {
    for (const v of [null, undefined, "P2002", 42, new Error("x"), { code: 2002 }, { code: null }, {}]) expect(errorCode(v), String(v)).toBeUndefined()
  })
})

describe("errorMessage", () => {
  it("prefers the error's own message, then a plain string or message field", () => {
    expect(errorMessage(new Error("Nope"))).toBe("Nope")
    expect(errorMessage("Plain")).toBe("Plain")
    expect(errorMessage({ message: "From object" })).toBe("From object")
  })

  it("falls back when there is nothing readable", () => {
    expect(errorMessage(null)).toBe("Something went wrong")
    expect(errorMessage(new Error(""), "Try again")).toBe("Try again")
    expect(errorMessage({ message: 5 }, "Try again")).toBe("Try again")
  })
})
