import { SERVICE_TYPES } from "@/lib/constants"

// Pure pricing rules for quote requests (no database): which works a garage can answer instantly, how a manual
// quote is split across works, and the estimate used when the garage misses its deadline.

export type LineSource = "FIXED" | "MANUAL" | "ESTIMATE"
export interface LineItem {
  serviceType: string
  price: number
  source: LineSource
}

export interface PriceRow {
  serviceType: string
  isActive: boolean
  autoQuote: boolean
  fixedPrice: number | null
  priceFrom: number | null
}

const KNOWN = new Set<string>(SERVICE_TYPES)
const round2 = (n: number) => Math.round(n * 100) / 100

/** The works on a request: the stored JSON list, falling back to the single serviceType. Unknown codes are dropped. */
export function parseWorks(servicesJson: string | null | undefined, serviceType: string): string[] {
  let list: unknown = []
  try {
    list = JSON.parse(servicesJson || "[]")
  } catch {
    list = []
  }
  const works = Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && KNOWN.has(x)))] : []
  return works.length > 0 ? works : [serviceType]
}

export function sumItems(items: LineItem[]): number {
  return round2(items.reduce((t, i) => t + i.price, 0))
}

export function parseLineItems(json: string | null | undefined): LineItem[] {
  try {
    const v = JSON.parse(json || "[]")
    return Array.isArray(v) ? v.filter((i) => i && typeof i.serviceType === "string" && typeof i.price === "number") : []
  } catch {
    return []
  }
}

const rowFor = (prices: PriceRow[], serviceType: string) => prices.find((p) => p.serviceType === serviceType && p.isActive)

/** Works the garage prices automatically (fixed price with "quote instantly" on). */
export function fixedItems(works: string[], prices: PriceRow[]): LineItem[] {
  const out: LineItem[] = []
  for (const w of works) {
    const r = rowFor(prices, w)
    if (r?.autoQuote && r.fixedPrice != null && r.fixedPrice > 0) out.push({ serviceType: w, price: round2(r.fixedPrice), source: "FIXED" })
  }
  return out
}

/** Every work priced automatically gives the instant quote; otherwise null (the garage must quote by hand). */
export function instantQuote(works: string[], prices: PriceRow[]): LineItem[] | null {
  const fixed = fixedItems(works, prices)
  return fixed.length === works.length && works.length > 0 ? fixed : null
}

/** The estimate sent when the garage misses its deadline: its fixed price, else its "from" price, for every work. */
export function estimateQuote(works: string[], prices: PriceRow[]): LineItem[] | null {
  const out: LineItem[] = []
  for (const w of works) {
    const r = rowFor(prices, w)
    const price = r?.fixedPrice != null && r.fixedPrice > 0 ? r.fixedPrice : r?.priceFrom != null && r.priceFrom > 0 ? r.priceFrom : null
    if (price === null) return null
    out.push({ serviceType: w, price: round2(price), source: "ESTIMATE" })
  }
  return out.length > 0 ? out : null
}

/** Validate a garage's amounts: exactly one positive amount per requested work. */
export function resolveManualItems(works: string[], items: { serviceType: string; price: number }[]): LineItem[] | { error: string } {
  const byService = new Map(items.map((i) => [i.serviceType, i.price]))
  if (byService.size !== items.length) return { error: "Each service can only be priced once" }
  for (const k of byService.keys()) if (!works.includes(k)) return { error: "That service isn't part of this request" }
  const out: LineItem[] = []
  for (const w of works) {
    const price = byService.get(w)
    if (price === undefined) return { error: "Add a price for every service in the request" }
    if (!(price > 0)) return { error: "Prices must be more than £0" }
    out.push({ serviceType: w, price: round2(price), source: "MANUAL" })
  }
  return out
}

/** The deadline for a garage to quote, from now. */
export function respondDeadline(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000)
}

/** Turn a garage's respond body into line items and a total: itemised amounts, or one price for a single work. */
export function resolveQuoteLines(
  works: string[],
  body: { price?: number; items?: { serviceType: string; price: number }[] }
): { items: LineItem[]; total: number } | { error: string } {
  if (body.items && body.items.length > 0) {
    const items = resolveManualItems(works, body.items)
    return "error" in items ? items : { items, total: sumItems(items) }
  }
  if (works.length === 1 && body.price !== undefined && body.price > 0) {
    const items: LineItem[] = [{ serviceType: works[0], price: round2(body.price), source: "MANUAL" }]
    return { items, total: sumItems(items) }
  }
  return { error: works.length > 1 ? "Add a price for every service in the request" : "Enter a price" }
}
