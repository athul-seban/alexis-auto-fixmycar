import type { Metadata } from "next"

// The page itself is a client component, which can't export metadata: this layout carries the title and indexing rules.
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Quote My Garage account.",
  robots: { index: false, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
