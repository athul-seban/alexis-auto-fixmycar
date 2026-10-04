import { describe, it, expect, vi, afterEach } from "vitest"
import { escapeHtml, timeAgo, getStatusColor } from "@/lib/utils"
import { jobRequestGarageNotification, jobResponseGuestNotification } from "@/lib/email-templates"

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;"
    )
  })

  it("renders null and undefined as an empty string", () => {
    expect(escapeHtml(null)).toBe("")
    expect(escapeHtml(undefined)).toBe("")
  })
})

describe("timeAgo", () => {
  afterEach(() => vi.useRealTimers())

  it("buckets into just now / minutes / hours / days", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    expect(timeAgo("2026-10-03T11:59:40Z")).toBe("just now")
    expect(timeAgo("2026-10-03T11:15:00Z")).toBe("45m ago")
    expect(timeAgo("2026-10-03T07:00:00Z")).toBe("5h ago")
    expect(timeAgo("2026-09-30T12:00:00Z")).toBe("3d ago")
  })
})

describe("getStatusColor", () => {
  it("has dark-mode variants and covers NO_SHOW", () => {
    expect(getStatusColor("NO_SHOW")).toContain("dark:")
    expect(getStatusColor("COMPLETED")).toContain("dark:")
  })

  it("falls back to a neutral colour for unknown statuses", () => {
    expect(getStatusColor("WHATEVER")).toContain("bg-gray-100")
  })
})

describe("email templates escape user-supplied text", () => {
  const garage: any = { name: "Bob's <b>Garage</b>", city: "Bristol", phone: "1", email: "g@example.com" }
  const jobRequest: any = {
    serviceType: "MOT",
    description: `<img src=x onerror="alert(1)">`,
    year: 2019,
    make: "Ford",
    model: "Focus",
    registration: "AB12CDE",
    city: "Bristol",
    postcode: "BS1 1AA",
    guestName: "<i>Guest</i>",
    token: "tok",
  }

  it("does not let a job description inject markup into the garage email", () => {
    const { html } = jobRequestGarageNotification({ garage, jobRequest })
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x")
    expect(html).toContain("/garage-dashboard/enquiries")
  })

  it("escapes the garage name and quote message in the guest email", () => {
    const { html } = jobResponseGuestNotification({
      garage,
      jobRequest,
      jobResponse: { price: 50, message: "<script>x</script>" } as any,
    })
    expect(html).not.toContain("<script>x</script>")
    expect(html).not.toContain("<b>Garage</b>")
    expect(html).toContain("&lt;b&gt;Garage&lt;/b&gt;")
  })
})
