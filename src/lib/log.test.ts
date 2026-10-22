import { afterEach, describe, expect, it, vi } from "vitest"
import { log, logger, maskEmail, maskPhone } from "@/lib/log"
import { sendSms } from "@/lib/sms"
import { sendMail } from "@/lib/mail"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("masking", () => {
  it("keeps the first letter and the domain of an email", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com")
    expect(maskEmail("a@b.co")).toBe("a***@b.co")
    for (const bad of ["", "nope", "@x.com"]) expect(maskEmail(bad), bad).toBe("***")
  })

  it("keeps only the last three digits of a phone number", () => {
    expect(maskPhone("+44 7700 900123")).toBe("***123")
    expect(maskPhone("1234")).toBe("***")
    expect(maskPhone("")).toBe("***")
  })
})

describe("log", () => {
  it("writes one JSON line with level, event, fields and a timestamp, to the right console method", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    log("info", "booking.created", { garageId: "g1" })
    logger.warn("slow.query", { ms: 900 })
    logger.error("boom")
    const parsed = JSON.parse(out.mock.calls[0][0] as string)
    expect(parsed).toMatchObject({ level: "info", event: "booking.created", garageId: "g1" })
    expect(Date.parse(parsed.time)).not.toBeNaN()
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({ level: "warn", event: "slow.query", ms: 900 })
    expect(JSON.parse(err.mock.calls[0][0] as string)).toMatchObject({ level: "error", event: "boom" })
  })
})

describe("the dev fallbacks for mail and SMS don't write people's details to the log", () => {
  it("mail logs a masked recipient and the subject, never the body", async () => {
    vi.stubEnv("EMAIL_SERVER_HOST", "")
    const out = vi.spyOn(console, "log").mockImplementation(() => {})
    const res = await sendMail({ to: "jane.doe@example.com", subject: "Reset your password", html: "<a href='https://x/reset?token=SECRET123'>reset</a>" })
    expect(res).toEqual({ success: true, skipped: true })
    const text = out.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(text).toContain("mail.skipped")
    expect(text).not.toContain("jane.doe@example.com")
    expect(text).not.toContain("SECRET123")
  })

  it("SMS never logs the number or the text in production, and says only that it was skipped", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("TWILIO_ACCOUNT_SID", "")
    const out = vi.spyOn(console, "log").mockImplementation(() => {})
    const res = await sendSms({ to: "+447700900123", body: "Hi Jane, your MOT is booked for 9am: https://x/manage/TOKEN987" })
    expect(res).toEqual({ success: false, skipped: true })
    const text = out.mock.calls.map((c) => c.join(" ")).join("\n")
    expect(text).toContain("sms.skipped")
    expect(text).not.toContain("447700900123")
    expect(text).not.toContain("TOKEN987")
    expect(text).not.toContain("Jane")
  })

  it("in development SMS shows the text, so a developer can see what would have been sent", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("TWILIO_ACCOUNT_SID", "")
    const out = vi.spyOn(console, "log").mockImplementation(() => {})
    await sendSms({ to: "+447700900123", body: "Hello dev" })
    expect(out.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("Hello dev")
  })
})
