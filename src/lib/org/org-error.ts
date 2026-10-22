// Typed errors thrown by the organisation services (roles, staff, locations); handleRouteError maps them to JSON.

export type OrgErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "LIMIT"
  | "LAST_OWNER"
  | "IN_USE"
  | "FEATURE_OFF"
  | "SIGN_IN_REQUIRED"
  | "CONFIRM_CONVERT"

const STATUS: Record<OrgErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  CONFLICT: 409,
  LIMIT: 409,
  LAST_OWNER: 409,
  IN_USE: 409,
  FEATURE_OFF: 404,
  SIGN_IN_REQUIRED: 401,
  CONFIRM_CONVERT: 409,
}

export class OrgError extends Error {
  readonly status: number
  constructor(
    readonly code: OrgErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "OrgError"
    this.status = STATUS[code]
  }
}
