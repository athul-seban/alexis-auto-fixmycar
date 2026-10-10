/** How a garage's average time-to-answer reads on a search card, or null when there is no history to base it on. */
export function responseTimeLabel(mins: number | null | undefined): string | null {
  if (mins === null || mins === undefined) return null
  if (mins <= 60) return "Usually responds within 1 hour"
  if (mins <= 240) return "Usually responds within a few hours"
  if (mins <= 24 * 60) return "Usually responds within a day"
  return "Usually responds within a few days"
}
