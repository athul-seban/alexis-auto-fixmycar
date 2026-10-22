import type { Metadata } from "next"

// The page itself is a client component, which can't export metadata: this layout carries the title and indexing rules.
export const metadata: Metadata = {
  title: "List your garage",
  description: "Join Quote My Garage to get found by local drivers, receive quote requests and take bookings online.",
  robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
