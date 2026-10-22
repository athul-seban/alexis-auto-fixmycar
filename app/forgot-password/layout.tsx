import type { Metadata } from "next"

// The page itself is a client component, which can't export metadata: this layout carries the title and indexing rules.
export const metadata: Metadata = {
  title: "Forgot your password?",
  description: "Get a link to reset your Quote My Garage password.",
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
