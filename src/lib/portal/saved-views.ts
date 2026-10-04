// Saved filter views for the bookings list: a name plus the URL query string it applies. They live in the
// browser's localStorage (per garage user, per device) — a convenience, not shared state.

export interface SavedView {
  name: string
  query: string
}

export const MAX_VIEWS = 10
const MAX_NAME = 40

/** Parse whatever is in storage, dropping anything malformed. Never throws. */
export function parseViews(raw: string | null): SavedView[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter((v): v is SavedView => v && typeof v.name === "string" && typeof v.query === "string" && v.name.trim().length > 0)
      .slice(0, MAX_VIEWS)
  } catch {
    return []
  }
}

/** Only filter params are worth saving — never the page number or the open booking. */
export function viewQuery(params: URLSearchParams, keys: readonly string[]): string {
  const out = new URLSearchParams()
  for (const key of keys) {
    const v = params.get(key)
    if (v) out.set(key, v)
  }
  return out.toString()
}

/** Add (or replace, by name, case-insensitively) a view. Returns null when it can't be saved. */
export function addView(views: SavedView[], name: string, query: string): SavedView[] | null {
  const clean = name.trim().slice(0, MAX_NAME)
  if (!clean || !query) return null
  const others = views.filter((v) => v.name.toLowerCase() !== clean.toLowerCase())
  if (others.length >= MAX_VIEWS) return null
  return [...others, { name: clean, query }]
}

export const removeView = (views: SavedView[], name: string): SavedView[] => views.filter((v) => v.name !== name)
