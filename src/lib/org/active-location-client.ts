import { ACTIVE_LOCATION_HEADER } from "@/lib/org/active-location"

// The browser's copy of "which location is this tab looking at". The portal shell sets it from the server-rendered choice;
// the fetch helpers then send it as a header on every API call, so two tabs open on different locations never cross
// wires through the shared cookie. It is only a request: the server checks it against the person's access every time.

let current: string | null = null

export const setActiveLocationId = (id: string | null): void => {
  current = id
}

/** Headers to add to an API request made from the portal. Empty outside the garage portal. */
export function activeLocationHeaders(url: string): Record<string, string> {
  return current && url.startsWith("/api/") ? { [ACTIVE_LOCATION_HEADER]: current } : {}
}
