import { beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { requireAdmin } from "@/lib/admin-auth"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const as = (role: string, id: string | undefined = "u1") => mockSession.mockResolvedValue({ user: { id, role, email: "x@example.com" }, expires: "" } as never)

beforeEach(() => mockSession.mockReset())

describe("requireAdmin", () => {
  it("lets an admin and a super admin through, with the user", async () => {
    as("ADMIN")
    const a = await requireAdmin()
    expect(a.ok && a.user).toMatchObject({ id: "u1", role: "ADMIN" })
    as("SUPER_ADMIN")
    expect((await requireAdmin()).ok).toBe(true)
  })

  it("answers 401 to nobody signed in, customers, garages and a session with no user id", async () => {
    mockSession.mockResolvedValue(null)
    for (const make of [() => mockSession.mockResolvedValue(null), () => as("OWNER"), () => as("GARAGE"), () => as("ADMIN", ""), () => mockSession.mockResolvedValue({ expires: "" } as never)]) {
      make()
      const r = await requireAdmin()
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.response.status).toBe(401)
        expect(await r.response.json()).toEqual({ error: "Unauthorized" })
      }
    }
  })

  it("superOnly refuses an ordinary admin with the same 401, and admits a super admin", async () => {
    as("ADMIN")
    const refused = await requireAdmin({ superOnly: true })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.response.status).toBe(401)
    as("SUPER_ADMIN")
    expect((await requireAdmin({ superOnly: true })).ok).toBe(true)
  })
})
