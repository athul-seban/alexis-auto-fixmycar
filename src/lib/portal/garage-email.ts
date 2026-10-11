import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { parsePortalSettings, type PortalSettings } from "@/lib/portal/portal-settings"
import { getMessages } from "@/lib/i18n/server"
import { makeTranslator, type Translate } from "@/lib/i18n/messages"

export type GarageEmailKind = keyof PortalSettings["notifications"]

/**
 * Email a garage only if it hasn't switched that kind of email off in Settings. In-app
 * notifications are unaffected. Failures never propagate (email must not break a booking).
 */
export async function emailGarage(
  garageId: string,
  kind: GarageEmailKind,
  build: (garage: { name: string; email: string }, t: Translate) => { subject: string; html: string }
): Promise<boolean> {
  try {
    const garage = await prisma.garage.findUnique({
      where: { id: garageId },
      select: { name: true, email: true, portalSettings: true },
    })
    if (!garage) return false
    if (!parsePortalSettings(garage.portalSettings).notifications[kind]) return false
    // The wording is admin-editable (Admin > Site content > Garage emails); garages are emailed in English.
    const t = makeTranslator(await getMessages("en"))
    await sendMail({ to: garage.email, ...build(garage, t) })
    return true
  } catch (err) {
    console.error("[garage-email]", err)
    return false
  }
}
