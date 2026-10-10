import { describe, it, expect } from "vitest"
import {
  DEFAULT_PORTAL_SETTINGS,
  parsePortalSettings,
  serializePortalSettings,
  mergePortalSettings,
  portalSettingsSchema,
} from "@/lib/portal/portal-settings"

describe("parsePortalSettings", () => {
  it("returns defaults for null, empty and corrupt input", () => {
    expect(parsePortalSettings(null)).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(parsePortalSettings("")).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(parsePortalSettings("{not json")).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(parsePortalSettings(JSON.stringify({ widget: { slotMins: 7 } }))).toEqual(DEFAULT_PORTAL_SETTINGS)
  })

  it("fills missing fields with defaults", () => {
    const s = parsePortalSettings(JSON.stringify({ widget: { leadHours: 5 } }))
    expect(s.widget.leadHours).toBe(5)
    expect(s.widget.enabled).toBe(true)
    expect(s.widget.slotMins).toBe(30)
    expect(s.notifications.emailNewBooking).toBe(true)
  })

  it("round-trips through serialize", () => {
    const s = mergePortalSettings(DEFAULT_PORTAL_SETTINGS, { widget: { autoConfirm: true, accent: "F97316" } })
    expect(parsePortalSettings(serializePortalSettings(s))).toEqual(s)
  })
})

describe("validation", () => {
  it("rejects bad accent colours and slot lengths", () => {
    expect(portalSettingsSchema.safeParse({ widget: { accent: "#fff" } }).success).toBe(false)
    expect(portalSettingsSchema.safeParse({ widget: { accent: "zzzzzz" } }).success).toBe(false)
    expect(portalSettingsSchema.safeParse({ widget: { slotMins: 25 } }).success).toBe(false)
    expect(portalSettingsSchema.safeParse({ widget: { leadHours: -1 } }).success).toBe(false)
    expect(portalSettingsSchema.safeParse({ widget: { maxDaysAhead: 0 } }).success).toBe(false)
  })

  it("accepts valid values", () => {
    const r = portalSettingsSchema.safeParse({ widget: { accent: "1e3a5f", slotMins: 60 }, bays: 3 })
    expect(r.success).toBe(true)
  })
})

describe("mergePortalSettings", () => {
  it("merges per section without losing siblings", () => {
    const merged = mergePortalSettings(DEFAULT_PORTAL_SETTINGS, { notifications: { emailReview: false } })
    expect(merged.notifications).toEqual({ emailNewBooking: true, emailCancellation: true, emailReview: false, emailMessage: true, smsCustomer: false })
    expect(merged.widget).toEqual(DEFAULT_PORTAL_SETTINGS.widget)
  })

  it("keeps payments and texting independent of the other sections", () => {
    const merged = mergePortalSettings(DEFAULT_PORTAL_SETTINGS, { payments: { enabled: true, depositPercent: 50 }, notifications: { smsCustomer: true } })
    expect(merged.payments).toEqual({ enabled: true, depositPercent: 50, refundPolicy: "UNTIL_24H" })
    expect(merged.notifications.smsCustomer).toBe(true)
    expect(merged.notifications.emailNewBooking).toBe(true)
    expect(merged.widget).toEqual(DEFAULT_PORTAL_SETTINGS.widget)
  })

  it("throws on invalid merged values (callers validate first)", () => {
    expect(() => mergePortalSettings(DEFAULT_PORTAL_SETTINGS, { widget: { slotMins: 7 } })).toThrow()
  })
})
