import Link from "next/link"

export const metadata = { title: "You're offline", robots: { index: false, follow: false } }

// Shown by the service worker (public/sw.js) when a page can't be loaded because there is no connection.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">You&apos;re offline</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        Quote My Garage needs a connection to load your quotes and bookings. Check your signal and try again.
      </p>
      <Link href="/" className="mt-6 rounded-lg bg-[#1E3A5F] px-5 py-2.5 text-sm font-semibold text-white">
        Try again
      </Link>
    </main>
  )
}
