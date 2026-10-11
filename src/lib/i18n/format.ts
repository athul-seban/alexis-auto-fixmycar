// Tiny, dependency-free string formatting shared by the server and the browser.

/** "Hello {name}" + { name: "Sam" } -> "Hello Sam". Unknown placeholders are left as written. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}
