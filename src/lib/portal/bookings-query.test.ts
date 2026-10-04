import { describe, it, expect } from "vitest"
import {
  parseBookingsQuery,
  buildBookingsWhere,
  buildOrderBy,
  tabWhere,
  defaultDir,
  type BookingsQuery,
} from "@/lib/portal/bookings-query"

const NOW = new Date("2026-10-03T11:00:00Z")
const parse = (qs: string) => parseBookingsQuery(new URLSearchParams(qs))
const ok = (qs: string): BookingsQuery => {
  const r = parse(qs)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("parseBookingsQuery", () => {
  it("applies defaults", () => {
    const q = ok("")
    expect(q).toMatchObject({ tab: "all", sort: "booked", dir: "desc", page: 1, pageSize: 25, format: "json" })
  })

  it("treats empty strings and the 'all' sentinel as no filter", () => {
    const q = ok("source=all&serviceType=&contacted=all&status=all&technicianId=")
    expect(q.source).toBeUndefined()
    expect(q.serviceType).toBeUndefined()
    expect(q.contacted).toBeUndefined()
    expect(q.status).toBeUndefined()
    expect(q.technicianId).toBeUndefined()
  })

  it("rejects unknown sort keys, tabs, sources and page sizes", () => {
    expect(parse("sort=password").ok).toBe(false)
    expect(parse("sort=id;DROP TABLE").ok).toBe(false)
    expect(parse("tab=everything").ok).toBe(false)
    expect(parse("source=MARS").ok).toBe(false)
    expect(parse("pageSize=1000").ok).toBe(false)
    expect(parse("pageSize=7").ok).toBe(false)
    expect(parse("page=0").ok).toBe(false)
  })

  it("accepts every supported page size", () => {
    for (const n of [10, 25, 50, 100]) expect(ok(`pageSize=${n}`).pageSize).toBe(n)
  })

  it("validates dates and their order", () => {
    expect(parse("bookedFrom=2026-13-40").ok).toBe(false)
    expect(parse("bookedFrom=2026-10-05&bookedTo=2026-10-01").ok).toBe(false)
    expect(parse("createdFrom=2026-10-05&createdTo=2026-10-01").ok).toBe(false)
    expect(parse("bookedFrom=2026-10-01&bookedTo=2026-10-05").ok).toBe(true)
  })

  it("defaults direction by tab and sort column", () => {
    expect(defaultDir("booked", "upcoming")).toBe("asc")
    expect(defaultDir("booked", "today")).toBe("asc")
    expect(defaultDir("booked", "all")).toBe("desc")
    expect(defaultDir("created", "completed")).toBe("desc")
    expect(defaultDir("vrm", "all")).toBe("asc")
    expect(defaultDir("price", "all")).toBe("desc")
    expect(ok("tab=upcoming").dir).toBe("asc")
    expect(ok("tab=upcoming&dir=desc").dir).toBe("desc")
  })
})

describe("buildBookingsWhere", () => {
  const flat = (q: BookingsQuery) => JSON.stringify(buildBookingsWhere("g1", q, NOW))

  it("always scopes to the garage (tenant isolation)", () => {
    const where = buildBookingsWhere("g1", ok(""), NOW) as { AND: object[] }
    expect(where.AND[0]).toEqual({ garageId: "g1" })
  })

  it("lower-cases search text and normalises the VRM filter", () => {
    expect(flat(ok("q=Brad%20Jarvis"))).toContain('"searchText":{"contains":"brad jarvis"}')
    expect(flat(ok("vrm=lj67%20xgs"))).toContain('"vrm":{"contains":"LJ67XGS"}')
  })

  it("maps contacted yes/no onto contactedAt", () => {
    expect(flat(ok("contacted=yes"))).toContain('"contactedAt":{"not":null}')
    expect(flat(ok("contacted=no"))).toContain('"contactedAt":null')
  })

  it("converts booked/created ranges to London-aligned half-open bounds", () => {
    const s = flat(ok("bookedFrom=2026-10-03&bookedTo=2026-10-03"))
    expect(s).toContain('"gte":"2026-10-02T23:00:00.000Z"')
    expect(s).toContain('"lt":"2026-10-03T23:00:00.000Z"')
  })

  it("applies exact-match filters", () => {
    const s = flat(ok("source=WIDGET&serviceType=MOT&status=CONFIRMED&technicianId=t1"))
    expect(s).toContain('"source":"WIDGET"')
    expect(s).toContain('"serviceType":"MOT"')
    expect(s).toContain('"status":"CONFIRMED"')
    expect(s).toContain('"technicianId":"t1"')
  })
})

describe("tabWhere", () => {
  it("upcoming = future pending/confirmed", () => {
    expect(tabWhere("upcoming", NOW)).toEqual({ scheduledAt: { gte: NOW }, status: { in: ["PENDING", "CONFIRMED"] } })
  })

  it("today spans the London day and excludes cancelled", () => {
    const w = tabWhere("today", NOW) as { scheduledAt: { gte: Date; lt: Date }; status: object }
    expect(w.scheduledAt.gte.toISOString()).toBe("2026-10-02T23:00:00.000Z")
    expect(w.scheduledAt.lt.toISOString()).toBe("2026-10-03T23:00:00.000Z")
    expect(w.status).toEqual({ notIn: ["CANCELLED"] })
  })

  it("completed / cancelled / all", () => {
    expect(tabWhere("completed", NOW)).toEqual({ status: "COMPLETED" })
    expect(tabWhere("cancelled", NOW)).toEqual({ status: "CANCELLED" })
    expect(tabWhere("all", NOW)).toEqual({})
  })
})

describe("buildOrderBy", () => {
  it("maps whitelisted keys to columns with an id tie-break", () => {
    expect(buildOrderBy({ sort: "name", dir: "asc" })).toEqual([{ customerName: "asc" }, { id: "asc" }])
    expect(buildOrderBy({ sort: "booked", dir: "desc" })).toEqual([{ scheduledAt: "desc" }, { id: "desc" }])
  })

  it("sorts vehicle by make then model", () => {
    expect(buildOrderBy({ sort: "vehicle", dir: "asc" })).toEqual([
      { vehicleMake: "asc" },
      { vehicleModel: "asc" },
      { id: "asc" },
    ])
  })
})
