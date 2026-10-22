import type { Metadata } from "next"

// The page itself is a client component, which can't export metadata: this layout carries the title and indexing rules.
export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a free Quote My Garage account to request quotes, book garages and keep your cars in one place.",
  robots: { index: false, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
