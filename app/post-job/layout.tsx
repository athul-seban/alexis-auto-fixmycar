import type { Metadata } from "next"

// The page itself is a client component, which can't export metadata: this layout carries the title and indexing rules.
export const metadata: Metadata = {
  title: "Post a job: get free quotes from local garages",
  description: "Tell us what your car needs and get quotes from trusted garages near you. Free, with no obligation to book.",
  robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
