import { z } from "zod"

// Stored as a JSON string in Garage.portalSettings. Parsing never throws: bad/missing data
// falls back to defaults so a corrupt row can't take the portal or the widget down.

export const SLOT_MINUTES = [15, 30, 45, 60, 90, 120] as const

const hex6 = /^[0-9a-fA-F]{6}$/

export const widgetSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  accent: z.string().regex(hex6, "Accent must be a 6-digit hex colour (no #)").default("1E3A5F"),
  leadHours: z.number().int().min(0).max(168).default(2),
  maxDaysAhead: z.number().int().min(1).max(365).default(60),
  slotMins: z.number().int().refine((n) => (SLOT_MINUTES as readonly number[]).includes(n), "Unsupported slot length").default(30),
  autoConfirm: z.boolean().default(false),
  successMessage: z.string().max(300).default(""),
})

export const notificationSettingsSchema = z.object({
  emailNewBooking: z.boolean().default(true),
  emailCancellation: z.boolean().default(true),
  emailReview: z.boolean().default(true),
})

export const REFUND_POLICIES = ["FULL", "UNTIL_24H", "NONE"] as const

// Online deposits taken through Stripe Checkout when a customer books via the widget.
export const paymentSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  depositPercent: z.number().int().min(5).max(100).default(25),
  // What a customer gets back when THEY cancel (a garage cancelling always refunds in full).
  refundPolicy: z.enum(REFUND_POLICIES).default("UNTIL_24H"),
})

export const portalSettingsSchema = z.object({
  widget: widgetSettingsSchema.default({}),
  payments: paymentSettingsSchema.default({}),
  notifications: notificationSettingsSchema.default({}),
  // Overrides capacity (concurrent jobs). Default = number of active technicians, min 1.
  bays: z.number().int().min(1).max(50).optional(),
})

export type PortalSettings = z.infer<typeof portalSettingsSchema>
export type WidgetSettings = z.infer<typeof widgetSettingsSchema>
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = portalSettingsSchema.parse({})

export function parsePortalSettings(raw: string | null | undefined): PortalSettings {
  if (!raw) return DEFAULT_PORTAL_SETTINGS
  try {
    const parsed = portalSettingsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_PORTAL_SETTINGS
  } catch {
    return DEFAULT_PORTAL_SETTINGS
  }
}

export function serializePortalSettings(settings: PortalSettings): string {
  return JSON.stringify(settings)
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/** Shallow-per-section merge of a validated patch into the current settings. */
export function mergePortalSettings(current: PortalSettings, patch: DeepPartial<PortalSettings>): PortalSettings {
  return portalSettingsSchema.parse({
    ...current,
    ...patch,
    widget: { ...current.widget, ...(patch.widget ?? {}) },
    payments: { ...current.payments, ...(patch.payments ?? {}) },
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
  })
}
