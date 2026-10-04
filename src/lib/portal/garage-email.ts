import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { parsePortalSettings, type PortalSettings } from "@/lib/portal/portal-settings"

export type GarageEmailKind = keyof PortalSettings["notifications"]

/**
 * Email a garage only if it hasn't switched that kind of email off in Settings. In-app
 * notifications are unaffected. Failures never propagate (email must not break a booking).
 */
export async function emailGarage(
  garageId: string,
  kind: GarageEmailKind,
  build: (garage: { name: string; email: string }) => { subject: string; html: string }
): Promise<boolean> {
  try {
    const garage = await prisma.garage.findUnique({
      where: { id: garageId },
      select: { name: true, email: true, portalSettings: true },
    })
    if (!garage) return false
    if (!parsePortalSettings(garage.portalSettings).notifications[kind]) return false
    await sendMail({ to: garage.email, ...build(garage) })
    return true
  } catch (err) {
    console.error("[garage-email]", err)
    return false
  }
}
