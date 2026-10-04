import { Suspense } from "react"
import { BookingsPage } from "@/components/garage-portal/bookings/BookingsPage"

export const metadata = { title: "Bookings" }

export default function GarageBookingsPage() {
  // BookingsPage reads the query string (tabs/filters), which requires a Suspense boundary.
  return (
    <Suspense>
      <BookingsPage />
    </Suspense>
  )
}
