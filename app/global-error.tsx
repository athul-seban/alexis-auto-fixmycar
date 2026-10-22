"use client"

// The last-resort page: shown when the root layout itself fails, so it can't rely on the app's providers, fonts or
// stylesheets and carries its own <html>, <body> and inline styles. Ordinary page errors are handled by app/error.tsx.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F8FAFC", color: "#0F172A" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ maxWidth: "26rem", margin: "0 0 24px", color: "#475569", lineHeight: 1.5 }}>
            We couldn&apos;t load this page. It&apos;s us, not you. Please try again, and if it keeps happening come back in a few minutes.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ background: "#1E3A5F", color: "#fff", border: 0, borderRadius: "10px", padding: "12px 20px", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
            {/* A plain link, not next/link: the router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#1E3A5F", border: "2px solid #CBD5E1", borderRadius: "10px", padding: "10px 20px", fontSize: "1rem", fontWeight: 600, textDecoration: "none" }}>
              Back to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
