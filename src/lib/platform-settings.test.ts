import { describe, it, expect } from "vitest"
import { decryptValue, encryptValue, isSettingKey, SETTING_KEYS, SETTING_META } from "@/lib/platform-settings"

// The database-backed parts (precedence, masking, audit) are covered through the route in
// app/api/admin/settings/route.test.ts, which owns the PlatformSetting rows during the run.

describe("encryption", () => {
  it("round-trips a value, including awkward characters", () => {
    const secret = "example-secret-value~not-real ünïcode ✓"
    expect(decryptValue(encryptValue(secret))).toBe(secret)
  })

  it("never stores the plain text and uses a fresh IV each time", () => {
    const a = encryptValue("hunter2-hunter2")
    const b = encryptValue("hunter2-hunter2")
    expect(a).not.toContain("hunter2")
    expect(a).not.toBe(b)
  })

  it("returns null for tampered, truncated or foreign values instead of throwing", () => {
    const good = encryptValue("value")
    const [v, iv, tag, data] = good.split(":")
    expect(decryptValue([v, iv, tag, data.slice(0, -2) + "AA"].join(":"))).toBeNull()
    expect(decryptValue([v, iv, "AAAAAAAAAAAAAAAAAAAAAA", data].join(":"))).toBeNull()
    expect(decryptValue("v1:nope")).toBeNull()
    expect(decryptValue("plain text")).toBeNull()
    expect(decryptValue("")).toBeNull()
  })
})

describe("setting keys", () => {
  it("only knows the documented credentials", () => {
    expect([...SETTING_KEYS].sort()).toEqual(["DVSA_API_KEY", "DVSA_CLIENT_ID", "DVSA_CLIENT_SECRET", "DVSA_TOKEN_URL", "VEHICLE_LOOKUP_API_KEY"])
    expect(isSettingKey("DVSA_API_KEY")).toBe(true)
    expect(isSettingKey("NEXTAUTH_SECRET")).toBe(false)
    expect(isSettingKey("DATABASE_URL")).toBe(false)
  })

  it("marks the secrets as secret", () => {
    expect(SETTING_META.DVSA_CLIENT_SECRET.secret).toBe(true)
    expect(SETTING_META.DVSA_API_KEY.secret).toBe(true)
    expect(SETTING_META.VEHICLE_LOOKUP_API_KEY.secret).toBe(true)
    expect(SETTING_META.DVSA_TOKEN_URL.secret).toBe(false)
  })
})
