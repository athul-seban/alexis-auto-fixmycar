import { describe, expect, it } from "vitest"
import { DEFAULT_MESSAGES, buildMessages, makeTranslator } from "@/lib/i18n/messages"
import { garageBookingCancelledEmail, garageNewBookingEmail, garageReviewEmail, messageReceivedEmail } from "./email-templates"

const base = { garageName: "Acme <Motors>", customerName: "Sam", serviceType: "MOT", whenLabel: "Mon 5 Oct, 10:00", vehicle: "Ford Focus", reference: "QMG-1", source: "Widget", ctaHref: "https://x.test/b" }

describe("garage-facing emails", () => {
  it("keep their original wording when nothing has been edited", () => {
    const m = garageNewBookingEmail(base)
    expect(m.subject).toBe("New booking: MOT Test for Ford Focus")
    expect(m.html).toContain("Hi Acme &lt;Motors&gt;,") // names are HTML-escaped
    expect(m.html).toContain("Sam has booked <strong>MOT Test</strong> (Widget).")
    expect(m.html).toContain("View Booking")
    expect(garageBookingCancelledEmail(base).subject).toBe("Booking cancelled: MOT Test on Mon 5 Oct, 10:00")
    expect(garageReviewEmail({ garageName: "A", rating: 5, comment: "Great", ctaHref: "https://x.test" }).subject).toBe("New 5-star review")
    expect(messageReceivedEmail({ recipientName: null, fromName: "Pat", about: "booking", preview: "hi", href: "https://x.test" }).html).toContain("Hi there,")
  })

  it("use the admin's edited wording, escaped, with **bold** and placeholders", () => {
    const t = makeTranslator(
      buildMessages("en", {
        "email.newBooking.subject": "Job in: {service} ({customer})",
        "email.newBooking.intro": "Heads up! **{customer}** wants {service} <b>now</b>",
        "email.newBooking.cta": "Open it",
      })
    )
    const m = garageNewBookingEmail({ ...base, customerName: "<img src=x onerror=alert(1)>", t })
    expect(m.subject).toBe("Job in: MOT Test (<img src=x onerror=alert(1)>)") // subjects are plain text
    expect(m.html).not.toContain("<img")
    expect(m.html).not.toContain("<b>now</b>")
    expect(m.html).toContain("&lt;b&gt;now&lt;/b&gt;")
    expect(m.html).toMatch(/Heads up! <strong>&lt;img[^<]*<\/strong> wants MOT Test/)
    expect(m.html).toContain("Open it")
    expect(m.html).toContain("<strong>When:</strong> Mon 5 Oct, 10:00") // structural details are always included
  })

  it("French and German have no email wording of their own and fall back to English", () => {
    for (const l of ["fr", "de"] as const) expect(DEFAULT_MESSAGES[l]["email.review.cta"]).toBe(DEFAULT_MESSAGES.en["email.review.cta"])
  })
})
