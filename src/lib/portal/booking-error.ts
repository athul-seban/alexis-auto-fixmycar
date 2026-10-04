// Typed errors thrown by the booking service; route handlers map them to JSON responses.

export type BookingErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_TRANSITION"
  | "TOO_EARLY"
  | "OVERLAP"
  | "PAST_TIME"
  | "VEHICLE_NOT_OWNED"
  | "QUOTE_MISMATCH"
  | "GARAGE_NOT_APPROVED"
  | "INVALID_INPUT"
  | "NOT_ACTIVE"
  | "CONFLICT"

const STATUS: Record<BookingErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_TRANSITION: 409,
  TOO_EARLY: 422,
  OVERLAP: 409,
  PAST_TIME: 422,
  VEHICLE_NOT_OWNED: 403,
  QUOTE_MISMATCH: 409,
  GARAGE_NOT_APPROVED: 409,
  INVALID_INPUT: 400,
  NOT_ACTIVE: 409,
  CONFLICT: 409,
}

export class BookingError extends Error {
  readonly status: number
  constructor(
    readonly code: BookingErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "BookingError"
    this.status = STATUS[code]
  }
}
