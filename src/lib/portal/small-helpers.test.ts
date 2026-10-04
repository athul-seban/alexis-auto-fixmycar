import { describe, it, expect } from "vitest"
import { normaliseVrm, isPlausibleVrm, formatVrm } from "@/lib/portal/vrm"
import { normalisePhone, formatPhone } from "@/lib/portal/phone"
import { generateReference, isValidReference } from "@/lib/portal/booking-ref"
import { buildSearchText, normaliseSearchQuery } from "@/lib/portal/search-text"
import { garageLinks, legacyGarageRedirect } from "@/lib/portal/links"

describe("vrm", () => {
  it("normalises case, spaces and punctuation", () => {
    expect(normaliseVrm("ab12 cde")).toBe("AB12CDE")
    expect(normaliseVrm("  pe67-lpj ")).toBe("PE67LPJ")
    expect(normaliseVrm(null)).toBe("")
  })

  it("applies the UK display space only to the current format", () => {
    expect(formatVrm("ab12cde")).toBe("AB12 CDE")
    expect(formatVrm("a1")).toBe("A1")
  })

  it("rejects implausible lengths", () => {
    expect(isPlausibleVrm("A")).toBe(false)
    expect(isPlausibleVrm("AB12CDE")).toBe(true)
    expect(isPlausibleVrm("ABCDEFGHI")).toBe(false)
  })
})

describe("phone", () => {
  it("normalises +44 and 0044 prefixes to national format", () => {
    expect(normalisePhone("+44 7700 900123")).toBe("07700900123")
    expect(normalisePhone("0044 7700 900123")).toBe("07700900123")
    expect(normalisePhone("(07700) 900-123")).toBe("07700900123")
    expect(normalisePhone(null)).toBe("")
  })

  it("formats UK mobiles with a space", () => {
    expect(formatPhone("+447700900123")).toBe("07700 900123")
    expect(formatPhone("0117 496 0000")).toBe("01174960000")
  })
})

describe("booking reference", () => {
  it("generates QMG-XXXXXX from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateReference()
      expect(isValidReference(ref)).toBe(true)
      expect(ref).not.toMatch(/[01OIL]/)
    }
  })

  it("is not constant", () => {
    const refs = new Set(Array.from({ length: 50 }, generateReference))
    expect(refs.size).toBeGreaterThan(40)
  })

  it("rejects malformed references", () => {
    expect(isValidReference("QMG-123")).toBe(false)
    expect(isValidReference("XYZ-ABCDEF")).toBe(false)
    expect(isValidReference("QMG-ABCDE0")).toBe(false)
  })
})

describe("search text", () => {
  it("lower-cases and joins the searchable fields, normalising phone and VRM", () => {
    const t = buildSearchText({
      customerName: "Bradley Jarvis",
      customerEmail: "Brad@Example.com",
      customerPhone: "+44 7700 900123",
      vrm: "lj67 xgs",
      vehicleMake: "Kia",
      vehicleModel: "Ceed",
      reference: "QMG-ABC234",
    })
    expect(t).toBe("bradley jarvis brad@example.com 07700900123 lj67xgs kia ceed qmg-abc234")
  })

  it("skips empty fields", () => {
    expect(buildSearchText({ customerName: "Ann", customerEmail: null })).toBe("ann")
  })

  it("normalises phone-looking queries and lower-cases the rest", () => {
    expect(normaliseSearchQuery("  Brad  ")).toBe("brad")
    expect(normaliseSearchQuery("+44 7700 900123")).toBe("07700900123")
  })
})

describe("garage links", () => {
  it("builds deep links", () => {
    expect(garageLinks.booking("abc")).toBe("/garage-dashboard/bookings?booking=abc")
    expect(garageLinks.enquiry("q1")).toBe("/garage-dashboard/enquiries?quote=q1")
  })

  it("maps legacy notification links onto the new pages", () => {
    expect(legacyGarageRedirect({ booking: "b1" })).toBe("/garage-dashboard/bookings?booking=b1")
    expect(legacyGarageRedirect({ quote: "q1" })).toBe("/garage-dashboard/enquiries?quote=q1")
    expect(legacyGarageRedirect({})).toBeNull()
  })
})
