import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { HeroSearch } from "@/components/home/HeroSearch"
import { HowItWorks } from "@/components/home/HowItWorks"
import { ServiceCategories } from "@/components/home/ServiceCategories"
import { Stats } from "@/components/home/Stats"
import { FeaturedGarages } from "@/components/home/FeaturedGarages"
import { Testimonials } from "@/components/home/Testimonials"
import { GarageCTA } from "@/components/home/GarageCTA"

export default function HomePage() {
  return (
    <>
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
