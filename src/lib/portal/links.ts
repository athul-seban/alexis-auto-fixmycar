// Single source of truth for garage-portal deep links (notifications, emails, redirects).

const BASE = "/garage-dashboard"

/** Absolute URL for emails (the app's public origin + a path). */
export function absoluteUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${path}`
}

/** The customer's secret view/cancel/review page for a booking (token from `Booking.manageToken`). */
export function manageUrl(token: string | null | undefined): string | null {
  return token ? absoluteUrl(`/booking/${token}`) : null
}

export const garageLinks = {
  dashboard: BASE,
  bookings: `${BASE}/bookings`,
  booking: (id: string) => `${BASE}/bookings?booking=${encodeURIComponent(id)}`,
  enquiries: `${BASE}/enquiries`,
  enquiry: (quoteId: string) => `${BASE}/enquiries?quote=${encodeURIComponent(quoteId)}`,
  reviews: `${BASE}/reviews`,
  diary: `${BASE}/diary`,
  website: `${BASE}/website`,
  profile: `${BASE}/profile`,
}

/**
 * Old notifications/emails point at `/garage-dashboard?booking=ID` or `?quote=ID`. Those
 * links live in the DB forever, so the portal root maps them onto the new pages.
 */
export function legacyGarageRedirect(params: { booking?: string; quote?: string }): string | null {
  if (params.booking) return garageLinks.booking(params.booking)
  if (params.quote) return garageLinks.enquiry(params.quote)
  return null
}
