import type { BookingSource } from "@/types"

export const SOURCE_LABELS: Record<BookingSource, string> = {
  MARKETPLACE: "Marketplace",
  QUOTE: "Quote",
  JOB_REQUEST: "Job request",
  WIDGET: "Widget",
  DIRECT: "Direct",
}

export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABELS) as BookingSource[]).map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}))

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source as BookingSource] ?? source
}
