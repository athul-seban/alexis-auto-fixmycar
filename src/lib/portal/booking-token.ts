import { prisma } from "@/lib/prisma"
import { BookingError } from "@/lib/portal/booking-error"

// Public, token-authenticated: the 128-bit manageToken in the customer's email is the credential.
// Only customer-safe fields are returned (never notes, technician, ip hash or other customers' data).
export async function loadByToken(token: string) {
  // A malformed token can't match; avoid hitting the DB with junk.
  if (!/^[a-f0-9]{32}$/.test(token)) throw new BookingError("NOT_FOUND", "Booking not found")
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: { garage: { select: { name: true, slug: true, phone: true, address: true, city: true, postcode: true } }, review: { select: { rating: true, comment: true, reply: true } } },
  })
  if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")
  return booking
}
