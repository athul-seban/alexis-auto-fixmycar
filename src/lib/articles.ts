// Guides & blog. Article bodies are a small Markdown subset, parsed into plain data and rendered as React elements, so
// nothing an author types can ever become raw HTML or a script. Supported: ## / ### headings, paragraphs, - bullet and
// 1. numbered lists, > quotes, **bold**, *italic* and [links](https://… or /path).

export type Inline = { type: "text"; text: string } | { type: "strong"; text: string } | { type: "em"; text: string } | { type: "link"; text: string; href: string }

export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; inline: Inline[] }
  | { type: "quote"; inline: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }

/** Only web links and site-relative paths: no `javascript:`, `data:` and friends. */
export function safeHref(href: string): string | null {
  const h = href.trim()
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h
  if (/^\/(?!\/)[^\s]*$/.test(h)) return h
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return h
  return null
}

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: "strong", text: m[1] })
    else if (m[2] !== undefined) out.push({ type: "em", text: m[2] })
    else {
      const href = safeHref(m[4])
      // An unsafe link degrades to its visible text rather than disappearing.
      out.push(href ? { type: "link", text: m[3], href } : { type: "text", text: m[3] })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) })
  return out
}

export function parseArticleBody(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let para: string[] = []
  let list: { kind: "ul" | "ol"; items: string[] } | null = null

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inline: parseInline(para.join(" ")) })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: list.kind, items: list.items.map(parseInline) })
    list = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/)
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    const quote = line.match(/^>\s?(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", text: heading[2] })
    } else if (bullet || numbered) {
      flushPara()
      const kind = bullet ? "ul" : "ol"
      if (list && list.kind !== kind) flushList()
      list = list ?? { kind, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (quote) {
      flushPara()
      flushList()
      blocks.push({ type: "quote", inline: parseInline(quote[1]) })
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks
}

/** URL slug: lower-case words and digits joined by hyphens. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80

/** Plain text of a body, for excerpts, word counts and search snippets. */
export function plainText(body: string): string {
  return parseArticleBody(body)
    .map((b) => {
      const inline = (parts: Inline[]) => parts.map((p) => p.text).join("")
      switch (b.type) {
        case "h2":
        case "h3":
          return b.text
        case "p":
        case "quote":
          return inline(b.inline)
        case "ul":
        case "ol":
          return b.items.map(inline).join(" ")
      }
    })
    .join(" ")
}

export const readingMinutes = (body: string) => Math.max(1, Math.round(plainText(body).split(/\s+/).filter(Boolean).length / 220))

export function excerptOf(a: { excerpt: string | null; body: string }, max = 160): string {
  const text = (a.excerpt?.trim() || plainText(a.body)).replace(/\s+/g, " ").trim()
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…"
}
