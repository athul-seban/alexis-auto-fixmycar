import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { currentStage, sendVehicleReminders } from "@/lib/vehicle-reminders"
import { cleanupPrefix, makeOwner } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn().mockResolvedValue(undefined) }))

const mail = vi.mocked(sendMail)
const PREFIX = "vehremind-"
const DAY = 24 * 3600 * 1000
const now = new Date("2026-10-10T07:00:00Z")
const inDays = (n: number) => new Date(now.getTime() + n * DAY)

beforeEach(async () => {
  mail.mockClear()
  mail.mockResolvedValue(undefined as never)
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("currentStage", () => {
  it("maps days left to the tightest stage reached", () => {
    expect(currentStage(45)).toBeNull()
    expect(currentStage(30)).toBe(30)
    expect(currentStage(15)).toBe(30)
    expect(currentStage(14)).toBe(14)
    expect(currentStage(8)).toBe(14)
    expect(currentStage(7)).toBe(7)
    expect(currentStage(0)).toBe(7)
    expect(currentStage(-1)).toBeNull()
  })
})

describe("sendVehicleReminders", () => {
  it("sends once per stage, not once a day", async () => {
    const { vehicle } = await makeOwner(PREFIX)
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { motDueDate: inDays(12) } })

    expect(await sendVehicleReminders(now)).toEqual({ sent: 1, skipped: 0 })
    // The next 4 days are all still inside the 14-day stage: nothing more goes out.
    for (let d = 1; d <= 4; d++) expect((await sendVehicleReminders(new Date(now.getTime() + d * DAY))).sent).toBe(0)
    expect(mail).toHaveBeenCalledTimes(1)
    // 7 days before the due date is the next stage.
    expect((await sendVehicleReminders(new Date(now.getTime() + 5 * DAY))).sent).toBe(1)
    expect(mail).toHaveBeenCalledTimes(2)
  })

  it("starts the stages again when the due date is changed", async () => {
    const { vehicle } = await makeOwner(PREFIX)
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { motDueDate: inDays(5) } })
    expect((await sendVehicleReminders(now)).sent).toBe(1)
    expect((await sendVehicleReminders(now)).sent).toBe(0)
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { motDueDate: inDays(6) } })
    expect((await sendVehicleReminders(now)).sent).toBe(1)
  })

  it("ignores dates more than 30 days away, in the past, and vehicles of owners who opted out of email", async () => {
    const far = await makeOwner(PREFIX, "far")
    await prisma.vehicle.update({ where: { id: far.vehicle.id }, data: { motDueDate: inDays(60) } })
    const past = await makeOwner(PREFIX, "past")
    await prisma.vehicle.update({ where: { id: past.vehicle.id }, data: { serviceDueDate: inDays(-3) } })
    const optedOut = await makeOwner(PREFIX, "optout")
    await prisma.user.update({ where: { id: optedOut.user.id }, data: { emailNotifications: false } })
    await prisma.vehicle.update({ where: { id: optedOut.vehicle.id }, data: { motDueDate: inDays(3) } })

    await sendVehicleReminders(now)
    expect(mail).not.toHaveBeenCalled()
  })

  it("releases the claim when the email fails so the next run retries", async () => {
    const { vehicle } = await makeOwner(PREFIX)
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { serviceDueDate: inDays(5) } })
    mail.mockResolvedValueOnce({ success: false } as never)

    expect(await sendVehicleReminders(now)).toEqual({ sent: 0, skipped: 1 })
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).serviceReminderStage).toBeNull()
    expect((await sendVehicleReminders(now)).sent).toBe(1)
  })
})
