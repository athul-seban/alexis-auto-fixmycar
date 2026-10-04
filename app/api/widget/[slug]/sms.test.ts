import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET as getConfig } from "./route"
import { POST as postBooking } from "./bookings/route"
import { DEFAULT_PORTAL_SETTINGS, serializePortalSettings } from "@/lib/portal/portal-settings"
import { addDays, londonWallToUtc, todayLondon } from "@/lib/portal/tz"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => ({ success: true })) }))

const PREFIX = "widgetsms-"
const ALL_OPEN = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: true, from: "09:00", to: "17:00" }]))
const DATE = addDays(todayLondon(), 4)
let n = 0

async function setup(smsCustomer: boolean) {
  const portalSettings = serializePortalSettings({
    ...DEFAULT_PORTAL_SETTINGS,
    widget: { ...DEFAULT_PORTAL_SETTINGS.widget, slotMins: 60, leadHours: 0 },
    notifications: { ...DEFAULT_PORTAL_SETTINGS.notifications, smsCustomer },
  })
  const { garage } = await makeGarage(PREFIX, { key: `g${n++}`, openingHours: ALL_OPEN, portalSettings, services: ["MOT"] })
  return garage
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const book = (slug: string, extra: object = {}) =>
  postBooking(
    new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "MOT", start: londonWallToUtc(DATE, "10:00").toISOString(), name: "Tex Ting", email: `${PREFIX}c${n++}@example.com`, phone: "07700900123", vrm: "wd19 abc", ...extra }),
    }),
    params(slug)
  )

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

describe("widget text-message consent", () => {
  it("offers the 'text me' option only when the garage has texting on", async () => {
    const on = await setup(true)
    const off = await setup(false)
    expect((await (await getConfig(new Request("http://x"), params(on.slug))).json()).settings.smsAvailable).toBe(true)
    expect((await (await getConfig(new Request("http://x"), params(off.slug))).json()).settings.smsAvailable).toBe(false)
  })

  it("stores the customer's choice on the booking", async () => {
    const g = await setup(true)
    const yes = await (await book(g.slug, { smsOptIn: true })).json()
    expect((await prisma.booking.findFirstOrThrow({ where: { reference: yes.reference } })).smsOptIn).toBe(true)
    // A different hour: the garage has one bay, so the same slot would be refused.
    const no = await (await book(g.slug, { start: londonWallToUtc(DATE, "12:00").toISOString() })).json()
    expect((await prisma.booking.findFirstOrThrow({ where: { reference: no.reference } })).smsOptIn).toBe(false)
  })
})
