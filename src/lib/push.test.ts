import { describe, expect, it } from "vitest"
import { isGone, pushMessage } from "./push"

describe("pushMessage", () => {
  it("turns a relative link into an absolute URL and clips long text", () => {
    const m = JSON.parse(pushMessage({ title: "T".repeat(300), body: "B".repeat(500), link: "/garage-dashboard/bookings" }))
    expect(m.title).toHaveLength(100)
    expect(m.body).toHaveLength(200)
    expect(m.url).toBe("http://localhost:3000/garage-dashboard/bookings")
  })
  it("keeps an absolute link and falls back to the home page", () => {
    expect(JSON.parse(pushMessage({ title: "t", body: "b", link: "https://example.com/x" })).url).toBe("https://example.com/x")
    expect(JSON.parse(pushMessage({ title: "t", body: "b" })).url).toBe("http://localhost:3000/")
  })
})

describe("isGone", () => {
  it("recognises a dead subscription but not a transient error", () => {
    expect(isGone({ statusCode: 410 })).toBe(true)
    expect(isGone({ statusCode: 404 })).toBe(true)
    expect(isGone({ statusCode: 500 })).toBe(false)
    expect(isGone(new Error("network"))).toBe(false)
    expect(isGone(null)).toBe(false)
  })
})
