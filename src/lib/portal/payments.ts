import type { PaymentSettings } from "@/lib/portal/portal-settings"

// Pure money rules for online deposits. Amounts are pounds in the database and pence for Stripe.

export const MIN_CHARGE_PENCE = 100 // Stripe's practical minimum is ~30p; below £1 a deposit isn't worth taking.

export const toPence = (pounds: number) => Math.round(pounds * 100)
export const toPounds = (pence: number) => Math.round(pence) / 100

/** The deposit for a booking, in pence, or 0 when none should be taken (disabled, free, or under the minimum). */
export function depositPence(totalPrice: number, settings: Pick<PaymentSettings, "enabled" | "depositPercent">): number {
  if (!settings.enabled || !(totalPrice > 0)) return 0
  const pence = Math.round(toPence(totalPrice) * (settings.depositPercent / 100))
  return pence >= MIN_CHARGE_PENCE ? Math.min(pence, toPence(totalPrice)) : 0
}

export interface RefundContext {
  policy: PaymentSettings["refundPolicy"]
  /** Who cancelled. A garage cancelling always owes the customer everything back. */
  cancelledBy: "GARAGE" | "CUSTOMER" | "SYSTEM"
  scheduledAt: Date
  now: Date
  paidPence: number
  alreadyRefundedPence?: number
}

const DAY_MS = 24 * 3_600_000

/** How much to refund, in pence (0 = none). Never more than what is still unrefunded. */
export function refundPence(c: RefundContext): number {
  const remaining = Math.max(0, c.paidPence - (c.alreadyRefundedPence ?? 0))
  if (remaining === 0) return 0
  if (c.cancelledBy !== "CUSTOMER") return remaining // garage or system (e.g. payment expired) cancels: full refund
  switch (c.policy) {
    case "FULL":
      return remaining
    case "UNTIL_24H":
      return c.scheduledAt.getTime() - c.now.getTime() >= DAY_MS ? remaining : 0
    case "NONE":
      return 0
  }
}

/** Highest platform fee we allow, so a typo in the environment can't take most of a garage's deposit. */
export const MAX_PLATFORM_FEE_PERCENT = 30

/** The platform commission from PLATFORM_FEE_PERCENT (default 0 = none). Invalid or out-of-range values mean 0. */
export function platformFeePercent(raw: string | undefined = process.env.PLATFORM_FEE_PERCENT): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 && n <= MAX_PLATFORM_FEE_PERCENT ? n : 0
}

/** The platform's cut of a deposit, in pence: rounded to the nearest penny and always less than the whole payment. */
export function platformFeePence(depositPence: number, percent: number = platformFeePercent()): number {
  if (percent <= 0 || depositPence <= 1) return 0
  return Math.min(Math.round((depositPence * percent) / 100), depositPence - 1)
}
