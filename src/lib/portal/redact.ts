// What a garage may see of a customer's request before the customer has accepted its quote.
// Name, phone, email and the full registration stay hidden until a booking exists; the booking
// snapshot (booking-service) is the point where they are revealed.

/** "LE11 3TU" -> "LE11". Falls back to the first four characters for odd input. */
export function outwardPostcode(postcode: string | null | undefined): string {
  const pc = (postcode ?? "").trim().toUpperCase()
  if (!pc) return ""
  const parts = pc.split(/\s+/)
  if (parts.length > 1) return parts[0]
  // No space: the inward code is always the last 3 characters.
  return pc.length > 4 ? pc.slice(0, -3) : pc
}

export interface RedactableVehicle {
  vrm: string | null
  make: string
  model: string
  year: number
}

export interface RedactedCustomerView {
  vehicle: RedactableVehicle
  customer: { name: string | null; phone: string | null }
  location: { city: string; postcode: string } | null
  detailsShared: boolean
}

/** Apply the reveal rule to the personal parts of an enquiry row. */
export function redactForGarage(
  input: { vehicle: RedactableVehicle; customer: { name: string | null; phone: string | null }; location: { city: string; postcode: string } | null },
  accepted: boolean
): RedactedCustomerView {
  if (accepted) return { ...input, detailsShared: true }
  return {
    vehicle: { ...input.vehicle, vrm: null },
    customer: { name: null, phone: null },
    location: input.location ? { city: input.location.city, postcode: outwardPostcode(input.location.postcode) } : null,
    detailsShared: false,
  }
}
