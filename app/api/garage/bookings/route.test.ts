import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"
import { londonWallToUtc, todayLondon } from "@/lib/portal/tz"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "gbooktest-"
const DAY = 86400000
const asUser = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role } } as any)

const get = (qs = "") => GET(new Request(`http://localhost/api/garage/bookings${qs ? `?${qs}` : ""}`))
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/garage/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("auth", () => {
  it("401 / 403 for anonymous and non-garage callers", async () => {
    mockSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    const { user } = await makeOwner(PREFIX)
    asUser(user.id, "OWNER")
    expect((await get()).status).toBe(403)
  })

  it("lets PENDING and SUSPENDED garages read, but blocks writes for SUSPENDED", async () => {
    const pending = await makeGarage(PREFIX, { status: "PENDING", key: "p" })
    asUser(pending.user.id)
    expect((await get()).status).toBe(200)

    const suspended = await makeGarage(PREFIX, { status: "SUSPENDED", key: "s" })
    asUser(suspended.user.id)
    expect((await get()).status).toBe(200)
    const res = await post({ customer: { name: "A" }, vehicle: { vrm: "AB12CDE" }, serviceType: "MOT", totalPrice: 10, scheduledAt: new Date(Date.now() + DAY).toISOString() })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("GARAGE_SUSPENDED")
  })
})

describe("GET /api/garage/bookings", () => {
  it("only returns the caller's garage's bookings (tenant isolation)", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    await makeWalkInBooking(mine.garage.id, { customerName: "Mine" })
    await makeWalkInBooking(other.garage.id, { customerName: "Theirs" })
    asUser(mine.user.id)

    const body = await (await get()).json()
    expect(body.total).toBe(1)
    expect(body.bookings[0].customerName).toBe("Mine")
  })

  it("exposes snapshot fields and hasOwner without joining owner/vehicle", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner } = await makeOwner(PREFIX)
    await makeWalkInBooking(garage.id, { customerName: "Walk In" })
    await makeWalkInBooking(garage.id, { customerName: "Has Account", ownerId: owner.id, vehicleId: null, source: "MARKETPLACE" })
    asUser(user.id)

    const { bookings } = await (await get("sort=name&dir=asc")).json()
    const byName = Object.fromEntries(bookings.map((b: any) => [b.customerName, b]))
    expect(byName["Walk In"]).toMatchObject({ hasOwner: false, vrm: "WK19ABC", vehicleMake: "Kia", source: "DIRECT" })
    expect(byName["Has Account"].hasOwner).toBe(true)
    expect(byName["Walk In"].reference).toMatch(/^QMG-/)
  })

  describe("tabs and counts", () => {
    it("splits bookings into upcoming / today / completed / cancelled", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      const noonToday = londonWallToUtc(todayLondon(), "12:00")
      await makeWalkInBooking(garage.id, { customerName: "Upcoming", scheduledAt: new Date(Date.now() + 3 * DAY), status: "CONFIRMED" })
      await makeWalkInBooking(garage.id, { customerName: "Today", scheduledAt: noonToday, status: "CONFIRMED" })
      await makeWalkInBooking(garage.id, { customerName: "Done", scheduledAt: new Date(Date.now() - 3 * DAY), status: "COMPLETED" })
      await makeWalkInBooking(garage.id, { customerName: "Cancelled", scheduledAt: new Date(Date.now() + 3 * DAY), status: "CANCELLED" })
      asUser(user.id)

      const names = async (tab: string) => (await (await get(`tab=${tab}`)).json()).bookings.map((b: any) => b.customerName).sort()
      expect(await names("all")).toEqual(["Cancelled", "Done", "Today", "Upcoming"])
      expect(await names("upcoming")).toContain("Upcoming")
      expect(await names("upcoming")).not.toContain("Cancelled")
      expect(await names("today")).toEqual(["Today"])
      expect(await names("completed")).toEqual(["Done"])
      expect(await names("cancelled")).toEqual(["Cancelled"])

      const { counts } = await (await get()).json()
      expect(counts).toMatchObject({ all: 4, today: 1, completed: 1, cancelled: 1, estimates: 0 })
    })

    it("counts priced quotes and job responses as estimates", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      const { user: owner, vehicle } = await makeOwner(PREFIX)
      await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "SENT", price: 50 } })
      await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "PENDING" } })
      asUser(user.id)
      expect((await (await get()).json()).counts.estimates).toBe(1)
    })
  })

  describe("filters", () => {
    const seed = async () => {
      const { user, garage } = await makeGarage(PREFIX)
      const tech = await prisma.technician.create({ data: { garageId: garage.id, name: "Tess" } })
      await makeWalkInBooking(garage.id, { customerName: "Brad Jarvis", searchText: "brad jarvis 07700900111 lj67xgs kia ceed", vrm: "LJ67XGS", source: "WIDGET", serviceType: "MOT", technicianId: tech.id, contactedAt: new Date(), scheduledAt: new Date("2026-11-10T10:00:00Z"), status: "CONFIRMED" })
      await makeWalkInBooking(garage.id, { customerName: "Liam Ryan", searchText: "liam ryan 07700900222 pe67lpj vw arteon", vrm: "PE67LPJ", source: "DIRECT", serviceType: "BRAKES", scheduledAt: new Date("2026-11-20T10:00:00Z"), status: "PENDING" })
      asUser(user.id)
      return { tech }
    }
    const names = async (qs: string) => (await (await get(qs)).json()).bookings.map((b: any) => b.customerName)

    it("searches by customer name case-insensitively and by phone in any format", async () => {
      await seed()
      expect(await names("q=BRAD")).toEqual(["Brad Jarvis"])
      expect(await names("q=jarvis")).toEqual(["Brad Jarvis"])
      expect(await names(`q=${encodeURIComponent("+44 7700 900222")}`)).toEqual(["Liam Ryan"])
      expect(await names("q=nobody")).toEqual([])
    })

    it("filters by VRM ignoring case and spaces", async () => {
      await seed()
      expect(await names(`vrm=${encodeURIComponent("lj67 xgs")}`)).toEqual(["Brad Jarvis"])
      expect(await names("vrm=PE67")).toEqual(["Liam Ryan"])
    })

    it("filters by source, service, status, contacted, technician", async () => {
      const { tech } = await seed()
      expect(await names("source=WIDGET")).toEqual(["Brad Jarvis"])
      expect(await names("serviceType=BRAKES")).toEqual(["Liam Ryan"])
      expect(await names("status=PENDING")).toEqual(["Liam Ryan"])
      expect(await names("contacted=yes")).toEqual(["Brad Jarvis"])
      expect(await names("contacted=no")).toEqual(["Liam Ryan"])
      expect(await names(`technicianId=${tech.id}`)).toEqual(["Brad Jarvis"])
      expect(await names("source=all&contacted=all")).toHaveLength(2)
    })

    it("filters bookings awaiting an outcome (slot passed, still pending/confirmed), honouring duration", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      const ago = (mins: number) => new Date(Date.now() - mins * 60000)
      await makeWalkInBooking(garage.id, { customerName: "Stale confirmed", status: "CONFIRMED", scheduledAt: ago(3 * 1440), durationMins: 60 })
      await makeWalkInBooking(garage.id, { customerName: "Stale pending", status: "PENDING", scheduledAt: ago(1440), durationMins: 60 })
      await makeWalkInBooking(garage.id, { customerName: "Still in slot", status: "CONFIRMED", scheduledAt: ago(30), durationMins: 120 })
      await makeWalkInBooking(garage.id, { customerName: "Completed", status: "COMPLETED", scheduledAt: ago(1440) })
      await makeWalkInBooking(garage.id, { customerName: "Future", status: "CONFIRMED", scheduledAt: new Date(Date.now() + 86400000) })
      asUser(user.id)

      const res = await (await get("outcome=pending&sort=name&dir=asc")).json()
      expect(res.bookings.map((x: any) => x.customerName)).toEqual(["Stale confirmed", "Stale pending"])
      expect(res.bookings.every((x: any) => x.displayStatus === "AWAITING_OUTCOME")).toBe(true)
      expect(res.total).toBe(2)
      expect((await get("outcome=bogus")).status).toBe(400)
    })

    it("filters by booked-for date range (inclusive, London days)", async () => {
      await seed()
      expect(await names("bookedFrom=2026-11-10&bookedTo=2026-11-10")).toEqual(["Brad Jarvis"])
      expect(await names("bookedFrom=2026-11-11&bookedTo=2026-11-30")).toEqual(["Liam Ryan"])
      expect(await names("bookedFrom=2026-12-01")).toEqual([])
    })
  })

  describe("sorting and paging", () => {
    it("sorts by whitelisted columns and rejects anything else", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      for (const n of ["Charlie", "Alice", "Bob"]) await makeWalkInBooking(garage.id, { customerName: n })
      asUser(user.id)

      const asc = (await (await get("sort=name&dir=asc")).json()).bookings.map((b: any) => b.customerName)
      expect(asc).toEqual(["Alice", "Bob", "Charlie"])
      const desc = (await (await get("sort=name&dir=desc")).json()).bookings.map((b: any) => b.customerName)
      expect(desc).toEqual(["Charlie", "Bob", "Alice"])

      expect((await get("sort=password")).status).toBe(400)
      expect((await get("sort=name;drop")).status).toBe(400)
      expect((await get("dir=sideways")).status).toBe(400)
    })

    it("paginates and only accepts supported page sizes", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      for (let i = 0; i < 12; i++) await makeWalkInBooking(garage.id, { customerName: `C${String(i).padStart(2, "0")}` })
      asUser(user.id)

      const p1 = await (await get("pageSize=10&sort=name&dir=asc")).json()
      expect(p1).toMatchObject({ total: 12, page: 1, pageSize: 10, totalPages: 2 })
      expect(p1.bookings).toHaveLength(10)
      const p2 = await (await get("pageSize=10&page=2&sort=name&dir=asc")).json()
      expect(p2.bookings.map((b: any) => b.customerName)).toEqual(["C10", "C11"])

      expect((await get("pageSize=1000")).status).toBe(400)
      expect((await get("pageSize=7")).status).toBe(400)
      expect((await get("page=0")).status).toBe(400)
    })

    it("400s on malformed or reversed date filters", async () => {
      const { user } = await makeGarage(PREFIX)
      asUser(user.id)
      expect((await get("bookedFrom=garbage")).status).toBe(400)
      expect((await get("bookedFrom=2026-10-05&bookedTo=2026-10-01")).status).toBe(400)
    })
  })

  describe("CSV export", () => {
    it("returns an attachment honouring filters, with BOM and normalised phones", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      await makeWalkInBooking(garage.id, { customerName: "Keep Me", customerPhone: "+44 7700 900123", searchText: "keep me" })
      await makeWalkInBooking(garage.id, { customerName: "Filtered Out", searchText: "filtered out" })
      asUser(user.id)

      const res = await get("format=csv&q=keep")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/csv")
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="bookings-\d{4}-\d{2}-\d{2}\.csv"$/)
      expect(res.headers.get("cache-control")).toBe("no-store")

      // text() strips a BOM, so check the raw bytes (EF BB BF) for the Excel-friendly marker.
      const bytes = new Uint8Array(await res.clone().arrayBuffer())
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const text = await res.text()
      expect(text.startsWith("Reference,Customer,")).toBe(true)
      expect(text).toContain("Keep Me")
      expect(text).not.toContain("Filtered Out")
      expect(text).toContain("07700900123")
      expect(text).not.toContain("+44")
    })

    it("neutralises spreadsheet formulas in customer-supplied cells", async () => {
      const { user, garage } = await makeGarage(PREFIX)
      await makeWalkInBooking(garage.id, { customerName: '=HYPERLINK("http://evil","x")', customerEmail: "+evil@example.com", searchText: "x" })
      asUser(user.id)

      const text = await (await get("format=csv")).text()
      expect(text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
      expect(text).toContain("'+evil@example.com")
      expect(text).not.toMatch(/(^|,)=HYPERLINK/m)
    })

    it("is allowed for a SUSPENDED garage (read-only)", async () => {
      const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
      await makeWalkInBooking(garage.id)
      asUser(user.id)
      expect((await get("format=csv")).status).toBe(200)
    })
  })
})

describe("POST /api/garage/bookings", () => {
  const future = (days = 3, hour = 10) => new Date(Date.now() + days * DAY).toISOString().replace(/T\d\d/, `T${String(hour).padStart(2, "0")}`)
  const walkIn = (extra: object = {}) => ({
    customer: { name: "Walk In Wendy", phone: "07700900123", email: "wendy@example.com" },
    vehicle: { vrm: "wk19 abc", make: "Kia", model: "Ceed", year: 2018 },
    serviceType: "MOT",
    scheduledAt: future(),
    totalPrice: 55,
    ...extra,
  })

  it("creates a confirmed DIRECT booking with snapshots, reference and normalised VRM", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)

    const res = await post(walkIn())
    const { booking } = await res.json()

    expect(res.status).toBe(201)
    expect(booking).toMatchObject({ source: "DIRECT", status: "CONFIRMED", customerName: "Walk In Wendy", vrm: "WK19ABC", hasOwner: false, vehicleMake: "Kia" })
    expect(booking.reference).toMatch(/^QMG-/)
    // Garage's own bookings don't count as "received" and don't notify the garage.
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).totalBookings).toBe(0)
    expect(await prisma.notification.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("validates required fields, price and the technician", async () => {
    const { user } = await makeGarage(PREFIX)
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    const alien = await prisma.technician.create({ data: { garageId: other.id, name: "Alien" } })
    asUser(user.id)

    expect((await post({ scheduledAt: future() })).status).toBe(400)
    expect((await post(walkIn({ customer: { name: "" } }))).status).toBe(400)
    expect((await post(walkIn({ totalPrice: -1 }))).status).toBe(400)
    expect((await post(walkIn({ serviceType: "NOPE" }))).status).toBe(400)
    expect((await post(walkIn({ scheduledAt: "tomorrow" }))).status).toBe(400)
    expect((await post(walkIn({ technicianId: alien.id }))).status).toBe(400)
  })

  it("accepts price-on-request (0)", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await post(walkIn({ totalPrice: 0 }))).status).toBe(201)
  })

  it("returns 409 OVERLAP with conflict details, and books anyway when overridden", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const when = future(4, 10)
    expect((await post(walkIn({ scheduledAt: when }))).status).toBe(201)

    const clash = await post(walkIn({ scheduledAt: when, customer: { name: "Second" } }))
    expect(clash.status).toBe(409)
    const body = await clash.json()
    expect(body.code).toBe("OVERLAP")
    expect(body.reason).toBe("FULL")
    expect(body.conflicts).toHaveLength(1)

    expect((await post(walkIn({ scheduledAt: when, customer: { name: "Second" }, allowOverlap: true }))).status).toBe(201)
  })

  it("warns (without blocking) when outside opening hours", async () => {
    const day = { open: true, from: "09:00", to: "17:00" }
    const hours = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, day]))
    const { user } = await makeGarage(PREFIX, { openingHours: hours })
    asUser(user.id)

    const late = await post(walkIn({ scheduledAt: londonWallToUtc(todayLondon(), "03:00").getTime() > Date.now() ? londonWallToUtc(todayLondon(), "03:00").toISOString() : new Date(londonWallToUtc(todayLondon(), "03:00").getTime() + DAY).toISOString() }))
    expect(late.status).toBe(201)
    expect((await late.json()).warnings).toContain("OUTSIDE_OPENING_HOURS")
  })

  it("books from a priced quote for an account holder, accepting the quote", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const quote = await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "BRAKES", description: "Front brakes squealing", status: "SENT", price: 180 } })
    asUser(user.id)

    const res = await post({ fromQuoteId: quote.id, scheduledAt: future() })
    const { booking } = await res.json()

    expect(res.status).toBe(201)
    expect(booking).toMatchObject({ source: "QUOTE", serviceType: "BRAKES", totalPrice: 180, hasOwner: true, vrm: "AB12CDE" })
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("ACCEPTED")
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "BOOKING_CREATED" } })).toBe(1)
  })

  it("won't book an unpriced quote or another garage's quote", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const unpriced = await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "PENDING" } })
    const foreign = await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: other.id, serviceType: "MOT", description: "Needs an MOT test", status: "SENT", price: 40 } })
    asUser(user.id)

    expect((await post({ fromQuoteId: unpriced.id, scheduledAt: future() })).status).toBe(409)
    expect((await post({ fromQuoteId: foreign.id, scheduledAt: future() })).status).toBe(404)
  })

  it("books from a guest job response, marking the job booked", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const job = await prisma.jobRequest.create({
      data: { token: `${PREFIX}tok-a`, guestName: "Gary Guest", guestEmail: `${PREFIX}gary@example.com`, guestPhone: "07700900777", registration: "GU12EST", make: "Audi", model: "A3", year: 2017, serviceType: "MOT", description: "Needs an MOT test please", city: "Testville", postcode: "ZZ9 1AB" },
    })
    const response = await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: garage.id, price: 65 } })
    asUser(user.id)

    const res = await post({ fromJobResponseId: response.id, scheduledAt: future(), durationMins: 90 })
    const { booking } = await res.json()

    expect(res.status).toBe(201)
    expect(booking).toMatchObject({ source: "JOB_REQUEST", status: "CONFIRMED", customerName: "Gary Guest", totalPrice: 65, durationMins: 90, timeConfirmed: true })
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("BOOKED")
    expect((await post({ fromJobResponseId: response.id, scheduledAt: future(9) })).status).toBe(409)
  })
})
