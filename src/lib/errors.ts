// Helpers for values that were thrown. A `catch` variable is `unknown`; these read what is commonly on it without `any`.

/** The `code` string on a thrown value, if it has one: a Prisma error ("P2002" unique, "P2003" foreign key, "P2025" not found). */
export function errorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

/** A fetch cancelled with an AbortController: expected when a newer request replaces it, never worth showing. */
export function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name: unknown }).name === "AbortError"
}

/** A readable message from anything thrown: an Error's own message, a string, or the fallback. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err) return err
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === "string" && m) return m
  }
  return fallback
}
