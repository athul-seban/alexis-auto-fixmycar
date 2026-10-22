import { afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"

afterEach(() => vi.restoreAllMocks())

describe("GET /api/health", () => {
  it("is 200 and not cacheable when the database answers", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({ status: "ok" })
  })

  it("is 503 when it can't, and tells the caller nothing about why (that goes to the log)", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"))
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(503)
    const body = JSON.stringify(await res.json())
    expect(body).toBe(JSON.stringify({ status: "unavailable" }))
    expect(body).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/)
    expect(JSON.parse(logged.mock.calls[0][0] as string)).toMatchObject({ level: "error", event: "health.database_unreachable" })
  })
})
