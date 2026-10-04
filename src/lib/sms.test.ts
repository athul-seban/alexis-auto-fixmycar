import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendSms, smsConfigured } from "@/lib/sms"
import { toE164Mobile } from "@/lib/portal/phone"

const ENV = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_MESSAGING_SERVICE_SID"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("toE164Mobile", () => {
  it("converts UK mobiles in any common format", () => {
    expect(toE164Mobile("07700 900123")).toBe("+447700900123")
    expect(toE164Mobile("+44 7700 900123")).toBe("+447700900123")
    expect(toE164Mobile("0044-7700-900123")).toBe("+447700900123")
  })
  it("rejects landlines, short numbers and empties (they can't receive texts)", () => {
    for (const bad of ["01632 960001", "020 7946 0000", "07700 90012", "", null, undefined, "abc"]) expect(toE164Mobile(bad as string)).toBeNull()
  })
})

describe("sendSms", () => {
  it("does nothing, and says so, when no provider is configured", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    vi.spyOn(console, "log").mockImplementation(() => {})
    expect(smsConfigured()).toBe(false)
    expect(await sendSms({ to: "+447700900123", body: "hi" })).toEqual({ success: false, skipped: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("posts the message to Twilio with basic auth", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123"
    process.env.TWILIO_AUTH_TOKEN = "secret"
    process.env.TWILIO_FROM = "+441234567890"
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchSpy)

    expect(await sendSms({ to: "+447700900123", body: "Hello there" })).toEqual({ success: true })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json")
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`)
    const form = new URLSearchParams(init.body)
    expect(Object.fromEntries(form)).toEqual({ To: "+447700900123", Body: "Hello there", From: "+441234567890" })
  })

  it("uses a messaging service instead of a From number when configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123"
    process.env.TWILIO_AUTH_TOKEN = "secret"
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG999"
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchSpy)
    await sendSms({ to: "+447700900123", body: "x" })
    const form = new URLSearchParams(fetchSpy.mock.calls[0][1].body)
    expect(form.get("MessagingServiceSid")).toBe("MG999")
    expect(form.has("From")).toBe(false)
  })

  it("reports Twilio errors and network failures without throwing", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123"
    process.env.TWILIO_AUTH_TOKEN = "secret"
    process.env.TWILIO_FROM = "+441234567890"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Invalid 'To' number" }) }).mockRejectedValueOnce(new Error("offline")))
    expect(await sendSms({ to: "+1", body: "x" })).toEqual({ success: false, error: "Invalid 'To' number" })
    expect(await sendSms({ to: "+1", body: "x" })).toEqual({ success: false, error: "offline" })
  })
})
