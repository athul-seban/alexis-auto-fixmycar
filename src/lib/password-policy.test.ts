import { describe, expect, it } from "vitest"
import { passwordProblem } from "./password-policy"

describe("passwordProblem", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblem("correct horse battery")).toBeNull()
    expect(passwordProblem("brandnewpass2")).toBeNull()
  })
  it("rejects short, very common, repeated and email-derived passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/)
    expect(passwordProblem("Password123")).toMatch(/too common/)
    expect(passwordProblem("aaaaaaaaaa")).toMatch(/repeated/)
    expect(passwordProblem("xx-jordan.smith-xx", { email: "jordan.smith@example.com" })).toMatch(/email/)
    expect(passwordProblem("x".repeat(101))).toMatch(/100/)
  })
})
