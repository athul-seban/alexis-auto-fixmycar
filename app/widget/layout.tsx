// The embeddable booking widget: no site Header/Footer, designed to live inside an <iframe> on a
// garage's own website (next.config.js allows framing for /widget/* only).
export const metadata = { title: "Book online", robots: { index: false, follow: false } }

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
