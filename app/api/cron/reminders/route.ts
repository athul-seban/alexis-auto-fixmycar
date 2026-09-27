// Not triggered by anything in this repo — the deployment target is AWS App
// Runner (see AWS-DEPLOYMENT.md), which has no built-in scheduler. Point an
// EventBridge Scheduler rule (or any external cron) at this endpoint with
// `Authorization: Bearer $CRON_SECRET`.
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { vehicleReminderNotification } from "@/lib/email-templates"
import { notifyUser } from "@/lib/notifications"

const REMINDER_WINDOW_DAYS = 14

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          { motDueDate: { gte: now, lte: windowEnd } },
          { serviceDueDate: { gte: now, lte: windowEnd } },
        ],
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })

    let sent = 0
    for (const vehicle of vehicles) {
      const reminders: { type: "MOT" | "SERVICE"; dueDate: Date }[] = []
      if (vehicle.motDueDate && vehicle.motDueDate >= now && vehicle.motDueDate <= windowEnd) {
        reminders.push({ type: "MOT", dueDate: vehicle.motDueDate })
      }
      if (vehicle.serviceDueDate && vehicle.serviceDueDate >= now && vehicle.serviceDueDate <= windowEnd) {
        reminders.push({ type: "SERVICE", dueDate: vehicle.serviceDueDate })
      }

      for (const reminder of reminders) {
        const { subject, html } = vehicleReminderNotification({
          ownerName: vehicle.owner.name,
          registration: vehicle.registration,
          make: vehicle.make,
          model: vehicle.model,
          reminderType: reminder.type,
          dueDate: reminder.dueDate,
        })
        await sendMail({ to: vehicle.owner.email, subject, html })
        await notifyUser({
          userId: vehicle.owner.id,
          type: "VEHICLE_REMINDER",
          title: subject,
          body: `${vehicle.registration} — due ${reminder.dueDate.toLocaleDateString("en-GB")}`,
          link: "/dashboard",
        })
        sent++
      }
    }

    return NextResponse.json({ success: true, remindersSent: sent })
  } catch (err) {
    console.error("Reminders cron error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
