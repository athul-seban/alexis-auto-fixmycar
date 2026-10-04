import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import {
  mergePortalSettings,
  notificationSettingsSchema,
  parsePortalSettings,
  serializePortalSettings,
  widgetSettingsSchema,
} from "@/lib/portal/portal-settings"

export const GET = withGarage("Garage settings GET", async (_req, { userId, garage }) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, password: true } })
  return NextResponse.json({
    settings: parsePortalSettings(garage.portalSettings),
    account: { name: user?.name ?? null, email: user?.email ?? null, hasPassword: !!user?.password },
    garage: { status: garage.status, slug: garage.slug },
  })
})

const patchSchema = z
  .object({
    widget: widgetSettingsSchema.partial().optional(),
    notifications: notificationSettingsSchema.partial().optional(),
    // null clears the override (capacity falls back to the number of active technicians).
    bays: z.number().int().min(1).max(50).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nothing to update")

export const PATCH = withGarage(
  "Garage settings PATCH",
  async (req, { garage }) => {
    const data = patchSchema.parse(await req.json())
    const current = parsePortalSettings(garage.portalSettings)
    const merged = mergePortalSettings(current, { widget: data.widget, notifications: data.notifications })
    const next = data.bays === undefined ? merged : { ...merged, bays: data.bays ?? undefined }

    await prisma.garage.update({ where: { id: garage.id }, data: { portalSettings: serializePortalSettings(next) } })
    return NextResponse.json({ settings: next })
  },
  { write: true }
)
