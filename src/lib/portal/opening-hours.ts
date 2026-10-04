import { z } from "zod"
import type { OpeningHours } from "@/types"

export const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
export type DayKey = (typeof DAY_ORDER)[number]

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z
  .object({ open: z.boolean(), from: z.string(), to: z.string() })
  .superRefine((d, ctx) => {
    if (!d.open) return // closed days may carry blank times
    if (!HHMM.test(d.from)) ctx.addIssue({ code: "custom", path: ["from"], message: "Opening time must be HH:mm" })
    if (!HHMM.test(d.to)) ctx.addIssue({ code: "custom", path: ["to"], message: "Closing time must be HH:mm" })
    if (HHMM.test(d.from) && HHMM.test(d.to) && d.from >= d.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Closing time must be after opening time" })
    }
  })

export const openingHoursSchema = z.object(
  Object.fromEntries(DAY_ORDER.map((d) => [d, daySchema])) as Record<DayKey, typeof daySchema>
)

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  monday: { open: true, from: "09:00", to: "17:30" },
  tuesday: { open: true, from: "09:00", to: "17:30" },
  wednesday: { open: true, from: "09:00", to: "17:30" },
  thursday: { open: true, from: "09:00", to: "17:30" },
  friday: { open: true, from: "09:00", to: "17:30" },
  saturday: { open: true, from: "09:00", to: "13:00" },
  sunday: { open: false, from: "", to: "" },
}

/** Fills any missing/partial day so the editor always has a complete week to show. */
export function normaliseOpeningHours(raw: Partial<OpeningHours> | null | undefined): OpeningHours {
  const out = {} as OpeningHours
  for (const d of DAY_ORDER) {
    const v = raw?.[d]
    out[d] = v && typeof v.open === "boolean" ? { open: v.open, from: v.from ?? "", to: v.to ?? "" } : DEFAULT_OPENING_HOURS[d]
  }
  return out
}

/** First problem found, as a readable message, or null when valid. */
export function openingHoursError(hours: OpeningHours): string | null {
  const parsed = openingHoursSchema.safeParse(hours)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  const day = DAY_LABELS[issue.path[0] as DayKey] ?? "A day"
  return `${day}: ${issue.message}`
}
