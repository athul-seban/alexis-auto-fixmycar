import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { vehicleReminderNotification } from "@/lib/email-templates"
import { notifyUser } from "@/lib/notifications"
import { diffDays, londonDateString, todayLondon } from "@/lib/portal/tz"

/** Days before the due date at which a reminder goes out, largest first. Each is sent once per due date. */
export const REMINDER_STAGES = [30, 14, 7] as const

/** The tightest stage a due date has reached (30, 14 or 7), or null if it's further away than 30 days or already past. */
export function currentStage(daysLeft: number): number | null {
  if (daysLeft < 0) return null
  for (const stage of [...REMINDER_STAGES].reverse()) if (daysLeft <= stage) return stage
  return null
}

type Kind = "MOT" | "SERVICE"

const FIELDS = {
  MOT: { due: "motDueDate", for: "motReminderFor", stage: "motReminderStage" },
  SERVICE: { due: "serviceDueDate", for: "serviceReminderFor", stage: "serviceReminderStage" },
} as const

/**
 * Email and notify owners about MOT / service dates coming up, once per stage (30, 14, 7 days before). The claim is a
 * compare-and-set on the vehicle, so overlapping cron runs can't double-send, and changing the due date starts the
 * stages again. A failed send releases the claim so the next run retries.
 */
export async function sendVehicleReminders(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const today = todayLondon(now)
  const windowEnd = new Date(now.getTime() + (REMINDER_STAGES[0] + 1) * 24 * 3600 * 1000)
  const windowStart = new Date(now.getTime() - 24 * 3600 * 1000)

  const vehicles = await prisma.vehicle.findMany({
    where: {
      OR: [
        { motDueDate: { gte: windowStart, lte: windowEnd } },
        { serviceDueDate: { gte: windowStart, lte: windowEnd } },
      ],
    },
    include: { owner: { select: { id: true, name: true, email: true, emailNotifications: true, suspendedAt: true } } },
    take: 1000,
  })

  let sent = 0
  let skipped = 0
  for (const vehicle of vehicles) {
    if (vehicle.owner.suspendedAt) continue
    for (const kind of ["MOT", "SERVICE"] as Kind[]) {
      const f = FIELDS[kind]
      const due = vehicle[f.due] as Date | null
      if (!due) continue
      const stage = currentStage(diffDays(today, londonDateString(due)))
      if (stage === null) continue

      const prevFor = vehicle[f.for] as Date | null
      const prevStage = vehicle[f.stage] as number | null
      const claim = await prisma.vehicle.updateMany({
        where: {
          id: vehicle.id,
          OR: [{ [f.for]: null }, { [f.for]: { not: due } }, { [f.stage]: null }, { [f.stage]: { gt: stage } }],
        },
        data: { [f.for]: due, [f.stage]: stage },
      })
      if (claim.count === 0) {
        skipped++
        continue
      }

      try {
        const { subject, html } = vehicleReminderNotification({
          ownerName: vehicle.owner.name,
          registration: vehicle.registration,
          make: vehicle.make,
          model: vehicle.model,
          reminderType: kind,
          dueDate: due,
        })
        if (vehicle.owner.emailNotifications) {
          const result = await sendMail({ to: vehicle.owner.email, subject, html })
          if (result?.success === false) throw new Error("email send failed")
        }
        await notifyUser({
          userId: vehicle.owner.id,
          type: "VEHICLE_REMINDER",
          title: subject,
          body: `${vehicle.registration} — due ${due.toLocaleDateString("en-GB")}`,
          link: "/dashboard/vehicles",
        })
        sent++
      } catch (err) {
        await prisma.vehicle.update({ where: { id: vehicle.id }, data: { [f.for]: prevFor, [f.stage]: prevStage } })
        console.error("[vehicle-reminders] failed for vehicle", vehicle.id, err)
        skipped++
      }
    }
  }
  return { sent, skipped }
}
