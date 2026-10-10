import { Suspense } from "react"
import { BillingPage } from "@/components/garage-portal/billing/BillingPage"

export const metadata = { title: "Plan & billing" }

export default function GarageBillingRoute() {
  // useSearchParams (the Stripe return flag) needs a Suspense boundary.
  return (
    <Suspense>
      <BillingPage />
    </Suspense>
  )
}
