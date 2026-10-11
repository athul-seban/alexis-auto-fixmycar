import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { HeroSearch } from "@/components/home/HeroSearch"
import { HowItWorks } from "@/components/home/HowItWorks"
import { ServiceCategories } from "@/components/home/ServiceCategories"
import { Stats } from "@/components/home/Stats"
import { FeaturedGarages } from "@/components/home/FeaturedGarages"
import { Testimonials } from "@/components/home/Testimonials"
import { GarageCTA } from "@/components/home/GarageCTA"
import { jsonLdString, organizationJsonLd, websiteJsonLd } from "@/lib/seo"

// Reads live garage / review numbers, so it is rendered per request rather than baked in at build time
// (a build must not depend on the database being reachable).
export const dynamic = "force-dynamic"

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(organizationJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(websiteJsonLd()) }} />
      <Header />
      <main>
        <HeroSearch />
        <HowItWorks />
        <ServiceCategories />
        <Stats />
        <FeaturedGarages />
        <Testimonials />
        <GarageCTA />
      </main>
      <Footer />
    </>
  )
}
