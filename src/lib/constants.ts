export const MAX_COMPARE_GARAGES = 4
export const COMPARE_STORAGE_KEY = "qmg:compare:v1"
export const MAX_MATCHED_GARAGES = 15

// Every service a garage can offer / a customer can book. Keep in sync with the ServiceType union.
export const SERVICE_TYPES = [
  "MOT", "FULL_SERVICE", "INTERIM_SERVICE", "MINOR_SERVICE", "REPAIR", "DIAGNOSTICS",
  "TYRES", "BRAKES", "CLUTCH", "CAMBELT", "EXHAUST", "BATTERY", "WINDSCREEN", "AIR_CON",
  "ELECTRIC_SERVICE", "OTHER",
] as const
