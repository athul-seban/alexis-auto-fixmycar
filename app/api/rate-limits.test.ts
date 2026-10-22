import { beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"

// Wiring check: each public or account-wide write endpoint asks the limiter before doing any work, and passes its 429 on.
// (The limiter itself is tested in src/lib/rate-limit.test.ts.) The limiter is mocked to always refuse.

const refuse = () => Response.json({ error: "Too many requests", retryAfter: 30 }, { status: 429, headers: { "Retry-After": "30" } })
const limitByIp = vi.fn(async () => refuse())
const limitByKey = vi.fn(async () => refuse())
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")
  return { ...actual, limitByIp: (...a: unknown[]) => (limitByIp as (...x: unknown[]) => unknown)(...a), limitByKey: (...a: unknown[]) => (limitByKey as (...x: unknown[]) => unknown)(...a) }
})
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

import { GET as garagesGet } from "./garages/route"
import { GET as widgetConfig } from "./widget/[slug]/route"
import { GET as widgetSlots } from "./widget/[slug]/slots/route"
import { GET as bookingSlots } from "./booking/[token]/slots/route"
import { GET as trackGet } from "./job-requests/track/[token]/route"
import { POST as trackAccept } from "./job-requests/track/[token]/accept/route"
import { POST as messagesPost } from "./messages/route"
import { POST as quotesPost } from "./quotes/route"
import { POST as bookingsPost } from "./bookings/route"
import { POST as reviewsPost } from "./reviews/route"

const mockSession = vi.mocked(getServerSession)
const get = (url = "http://x/api") => new Request(url, { headers: { "x-forwarded-for": "203.0.113.7" } })
const post = (url = "http://x/api") => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" }, body: "{}" })
const slug = { params: Promise.resolve({ slug: "acme" }) }
const token = { params: Promise.resolve({ token: "tok" }) }

beforeEach(() => {
  limitByIp.mockClear()
  limitByKey.mockClear()
  mockSession.mockResolvedValue({ user: { id: "owner-1", role: "OWNER" }, expires: "" } as never)
})

describe("public endpoints are limited per visitor", () => {
  const cases: [string, () => Promise<Response>, string][] = [
    ["GET /api/garages", () => garagesGet(get()), "garages"],
    ["GET /api/widget/[slug]", () => widgetConfig(get(), slug), "widget-config"],
    ["GET /api/widget/[slug]/slots", () => widgetSlots(get("http://x/api?date=2026-11-02&service=MOT"), slug), "widget-slots"],
    ["GET /api/booking/[token]/slots", () => bookingSlots(get("http://x/api?date=2026-11-02"), token), "booking-slots"],
    ["GET /api/job-requests/track/[token]", () => trackGet(get(), token), "job-track"],
    ["POST /api/job-requests/track/[token]/accept", () => trackAccept(post(), token), "job-accept"],
  ]
  for (const [name, call, key] of cases) {
    it(`${name} answers 429 with Retry-After when the limiter refuses`, async () => {
      const res = await call()
      expect(res.status).toBe(429)
      expect(res.headers.get("retry-after")).toBe("30")
      expect(limitByIp).toHaveBeenCalledWith(expect.any(Headers), key, expect.any(Number), expect.any(Number))
    })
  }
})

describe("account-wide writes are limited per signed-in user, not per address", () => {
  const cases: [string, () => Promise<Response>, string][] = [
    ["POST /api/messages", () => messagesPost(post()), "messages"],
    ["POST /api/quotes", () => quotesPost(post()), "quotes"],
    ["POST /api/bookings", () => bookingsPost(post()), "bookings"],
    ["POST /api/reviews", () => reviewsPost(post()), "reviews"],
  ]
  for (const [name, call, key] of cases) {
    it(`${name} answers 429 when the limiter refuses, keyed on the user id`, async () => {
      const res = await call()
      expect(res.status).toBe(429)
      expect(limitByKey).toHaveBeenCalledWith(key, "owner-1", expect.any(Number), expect.any(Number))
    })

    it(`${name} is still 401 for nobody signed in (the limiter doesn't answer first)`, async () => {
      mockSession.mockResolvedValue(null)
      expect((await call()).status).toBe(401)
      expect(limitByKey).not.toHaveBeenCalled()
    })
  }
})
