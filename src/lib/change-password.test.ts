import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { changePassword } from "@/lib/change-password"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const PREFIX = "chgpw-"
const OLD = "old-passphrase-123"
const NEW = "new-passphrase-456"

async function makeUser(key: string) {
  return prisma.user.create({ data: { email: `${PREFIX}${key}@example.com`, role: "OWNER", password: await bcrypt.hash(OLD, 4) } })
}

beforeEach(() => prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }))
afterAll(() => prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }))

describe("changePassword", () => {
  it("changes the password and signs out every existing session by bumping sessionVersion (regression)", async () => {
    const u = await makeUser("ok")
    const res = await changePassword(u.id, { current: OLD, next: NEW })
    expect(res.status).toBe(200)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect(await bcrypt.compare(NEW, after.password!)).toBe(true)
    expect(after.sessionVersion).toBe(u.sessionVersion + 1)
  })

  it("leaves sessions alone when the change is refused", async () => {
    const u = await makeUser("refused")
    expect((await changePassword(u.id, { current: "wrong", next: NEW })).status).toBe(400)
    expect((await changePassword(u.id, { current: OLD, next: "short" })).status).toBe(400)
    expect((await changePassword(u.id, { current: OLD, next: OLD })).status).toBe(400)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect(after.sessionVersion).toBe(u.sessionVersion)
    expect(await bcrypt.compare(OLD, after.password!)).toBe(true)
  })
})
