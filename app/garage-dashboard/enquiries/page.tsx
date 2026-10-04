import { Suspense } from "react"
import { EnquiriesPage } from "@/components/garage-portal/enquiries/EnquiriesPage"

export const metadata = { title: "Enquiries" }

export default function GarageEnquiriesPage() {
  // EnquiriesPage reads the query string (stage/filters/?quote= deep link): needs Suspense.
  return (
    <Suspense>
      <EnquiriesPage />
    </Suspense>
  )
}
