// Constants shared by the garage upload form (client) and the document routes (server). Kept free of server-only
// imports so the browser bundle doesn't pull in the blob SDK.

export const DOCUMENT_KINDS = ["INSURANCE", "TRADE_CERTIFICATE", "ID", "OTHER"] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  INSURANCE: "Public liability insurance",
  TRADE_CERTIFICATE: "Trade certificate / accreditation",
  ID: "Owner photo ID",
  OTHER: "Other",
}

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
export const MAX_DOCUMENTS_PER_GARAGE = 12

export const isDocumentKind = (v: unknown): v is DocumentKind => typeof v === "string" && (DOCUMENT_KINDS as readonly string[]).includes(v)
