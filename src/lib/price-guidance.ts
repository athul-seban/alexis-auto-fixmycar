import { prisma } from "@/lib/prisma"

// "Typical price" for a service, built from quotes customers actually accepted on the platform. A range is only shown
// once there are enough samples to mean something, so a single odd quote can't be presented as "the going rate".

export const MIN_SAMPLES = 5

export interface PriceGuidance {
  low: number
  median: number
  high: number
  samples: number
}

/** Linear-interpolated percentile of an ascending-sorted list, p in 0..1. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const round5 = (n: number) => Math.round(n / 5) * 5

/** The middle half of accepted prices (25th to 75th percentile) plus the median, rounded to the nearest £5. */
export function summarisePrices(prices: number[], minSamples = MIN_SAMPLES): PriceGuidance | null {
  const clean = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b)
  if (clean.length < minSamples) return null
  return {
    low: round5(percentile(clean, 0.25)),
    median: round5(percentile(clean, 0.5)),
    high: round5(percentile(clean, 0.75)),
    samples: clean.length,
  }
}

/** Accepted prices for a service (optionally in a city), from accepted quotes and accepted job responses. */
export async function getPriceGuidance(serviceType: string, city?: string | null): Promise<PriceGuidance | null> {
  const cityFilter = city ? { garage: { city: { contains: city } } } : {}
  const [quotes, responses] = await Promise.all([
    prisma.quote.findMany({
      where: { serviceType, status: "ACCEPTED", price: { gt: 0 }, ...cityFilter },
      select: { price: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobResponse.findMany({
      where: { status: "ACCEPTED", jobRequest: { serviceType }, ...cityFilter },
      select: { price: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
  ])
  return summarisePrices([...quotes.map((q) => q.price ?? 0), ...responses.map((r) => r.price)])
}
