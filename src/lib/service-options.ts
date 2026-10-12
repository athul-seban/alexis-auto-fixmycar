import { SERVICE_TYPES } from "@/lib/constants"
import { getServiceLabel } from "@/lib/utils"

export interface ServiceOption {
  value: (typeof SERVICE_TYPES)[number]
  label: string
}

/** Every service, labelled. The one list behind the search, post-job, garage-register and profile pickers. */
export const SERVICE_OPTIONS: ServiceOption[] = SERVICE_TYPES.map((value) => ({ value, label: getServiceLabel(value) }))

/** For searching: "Other" isn't something a garage can be found by. */
export const SEARCH_SERVICE_OPTIONS: ServiceOption[] = SERVICE_OPTIONS.filter((s) => s.value !== "OTHER")
