import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { clearSettingsCache, getSetting, SETTING_KEYS } from "@/lib/platform-settings"
import { testMotConnection } from "@/lib/mot-history"
import { DELETE, GET, POST, PUT } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mot-history", () => ({ testMotConnection: vi.fn() }))

const mockSession = vi.mocked(getServerSession)
const mockTest = vi.mocked(testMotConnection)
const PREFIX = "settingstest-"
const SECRET = "SuperSecretApiKey0123456789wxyz"

let superId: string
const envBackup: Record<string, string | undefined> = {}

const asSuper = () => mockSession.mockResolvedValue({ user: { id: superId, role: "SUPER_ADMIN", email: `${PREFIX}super@example.com` } } as never)
const asAdmin = () => mockSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never)
const json = (method: string, body: unknown) => new Request("http://localhost/api/admin/settings", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

async function cleanup() {
  await prisma.platformSetting.deleteMany({ where: { key: { in: [...SETTING_KEYS] } } })
  await prisma.auditLog.deleteMany({ where: { targetType: "SETTING" } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  clearSettingsCache()
}

beforeEach(async () => {
  for (const k of SETTING_KEYS) {
    envBackup[k] ??= process.env[k]
    delete process.env[k]
  }
  await cleanup()
  superId = (await prisma.user.create({ data: { email: `${PREFIX}super@example.com`, role: "SUPER_ADMIN" } })).id
  asSuper()
  mockTest.mockReset()
})

afterAll(async () => {
  await cleanup()
  for (const k of SETTING_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k]
    else process.env[k] = envBackup[k]
  }
})

describe("/api/admin/settings — who may use it", () => {
  it("rejects ordinary admins, owners and signed-out visitors on every method", async () => {
    for (const session of [{ user: { id: "a", role: "ADMIN" } }, { user: { id: "o", role: "OWNER" } }, { user: { id: "g", role: "GARAGE" } }, null]) {
      mockSession.mockResolvedValue(session as never)
      expect((await GET()).status).toBe(401)
      expect((await PUT(json("PUT", { key: "DVSA_API_KEY", value: "x" }))).status).toBe(401)
      expect((await DELETE(new Request("http://localhost/api/admin/settings?key=DVSA_API_KEY", { method: "DELETE" }))).status).toBe(401)
      expect((await POST(json("POST", { action: "test", target: "dvsa" }))).status).toBe(401)
    }
    expect(await prisma.platformSetting.count()).toBe(0)
    expect(mockTest).not.toHaveBeenCalled()
  })

  it("lets a super admin in", async () => {
    asSuper()
    expect((await GET()).status).toBe(200)
  })

  it("an ordinary admin can't save even when they know the key name", async () => {
    asAdmin()
    const res = await PUT(json("PUT", { key: "DVSA_API_KEY", value: SECRET }))
    expect(res.status).toBe(401)
    expect(await prisma.platformSetting.count()).toBe(0)
  })
})

describe("/api/admin/settings — saving", () => {
  it("stores the value encrypted and never returns it", async () => {
    const res = await PUT(json("PUT", { key: "DVSA_API_KEY", value: `  ${SECRET}  ` }))
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).not.toContain(SECRET)

    const row = await prisma.platformSetting.findUnique({ where: { key: "DVSA_API_KEY" } })
    expect(row?.value).not.toContain(SECRET)
    expect(row?.updatedById).toBe(superId)
    expect(await getSetting("DVSA_API_KEY")).toBe(SECRET) // trimmed, decrypts back

    const body = await (await GET()).json()
    const status = body.settings.find((s: { key: string }) => s.key === "DVSA_API_KEY")
    expect(status).toMatchObject({ set: true, source: "saved", preview: `••••${SECRET.slice(-4)}`, updatedBy: `${PREFIX}super@example.com` })
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it("shows non-secret values (client id, token URL) in full", async () => {
    const url = "https://login.microsoftonline.com/tenant/oauth2/v2.0/token"
    await PUT(json("PUT", { key: "DVSA_TOKEN_URL", value: url }))
    const body = await (await GET()).json()
    expect(body.settings.find((s: { key: string }) => s.key === "DVSA_TOKEN_URL").preview).toBe(url)
  })

  it("replaces an existing value", async () => {
    await PUT(json("PUT", { key: "DVSA_API_KEY", value: "first-value-1111" }))
    await PUT(json("PUT", { key: "DVSA_API_KEY", value: "second-value-2222" }))
    expect(await getSetting("DVSA_API_KEY")).toBe("second-value-2222")
    expect(await prisma.platformSetting.count({ where: { key: "DVSA_API_KEY" } })).toBe(1)
  })

  it("rejects unknown keys, empty values and multi-line values", async () => {
    expect((await PUT(json("PUT", { key: "DATABASE_URL", value: "x" }))).status).toBe(400)
    expect((await PUT(json("PUT", { key: "DVSA_API_KEY", value: "   " }))).status).toBe(400)
    expect((await PUT(json("PUT", { key: "DVSA_API_KEY", value: "abc\ndef" }))).status).toBe(400)
    expect(await prisma.platformSetting.count()).toBe(0)
  })

  it("audits the change without the value", async () => {
    await PUT(json("PUT", { key: "DVSA_CLIENT_SECRET", value: SECRET }))
    const entries = await prisma.auditLog.findMany({ where: { targetType: "SETTING" } })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: "SETTING_UPDATED", targetId: "DVSA_CLIENT_SECRET", actorId: superId })
    expect(JSON.stringify(entries)).not.toContain(SECRET)
  })
})

describe("/api/admin/settings — environment fallback and clearing", () => {
  it("uses the env var when nothing is saved, and reports where the value comes from", async () => {
    process.env.DVSA_API_KEY = "env-api-key-abcd"
    clearSettingsCache()
    expect(await getSetting("DVSA_API_KEY")).toBe("env-api-key-abcd")
    const body = await (await GET()).json()
    expect(body.settings.find((s: { key: string }) => s.key === "DVSA_API_KEY")).toMatchObject({ set: true, source: "env", preview: "••••abcd" })
  })

  it("a saved value wins over the env var, and clearing it brings the env var back", async () => {
    process.env.DVSA_API_KEY = "env-api-key-abcd"
    await PUT(json("PUT", { key: "DVSA_API_KEY", value: "saved-api-key-wxyz" }))
    expect(await getSetting("DVSA_API_KEY")).toBe("saved-api-key-wxyz")

    const res = await DELETE(new Request("http://localhost/api/admin/settings?key=DVSA_API_KEY", { method: "DELETE" }))
    expect(res.status).toBe(200)
    expect(await getSetting("DVSA_API_KEY")).toBe("env-api-key-abcd")
    expect((await prisma.auditLog.findMany({ where: { action: "SETTING_CLEARED" } })).length).toBe(1)
  })

  it("reports 'not set' when neither exists", async () => {
    const body = await (await GET()).json()
    expect(body.settings.every((s: { set: boolean; source: string }) => !s.set && s.source === "none")).toBe(true)
  })

  it("rejects clearing an unknown key", async () => {
    expect((await DELETE(new Request("http://localhost/api/admin/settings?key=NEXTAUTH_SECRET", { method: "DELETE" }))).status).toBe(400)
  })
})

describe("/api/admin/settings — test connection", () => {
  it("returns the helper's verdict and audits pass or fail", async () => {
    mockTest.mockResolvedValueOnce({ ok: false, message: "DVSA's login worked but it rejected the API key (HTTP 403)." })
    const res = await POST(json("POST", { action: "test", target: "dvsa" }))
    expect(await res.json()).toEqual({ ok: false, message: "DVSA's login worked but it rejected the API key (HTTP 403)." })

    mockTest.mockResolvedValueOnce({ ok: true, message: "Connected" })
    await POST(json("POST", { action: "test", target: "dvsa" }))
    const entries = await prisma.auditLog.findMany({ where: { action: "SETTING_TESTED" }, orderBy: { createdAt: "asc" } })
    expect(entries.map((e) => e.detail)).toEqual(["Failed", "Passed"])
  })

  it("rejects an unknown test target", async () => {
    expect((await POST(json("POST", { action: "test", target: "stripe" }))).status).toBe(400)
    expect(mockTest).not.toHaveBeenCalled()
  })
})
