import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    template: "%s | Quote My Garage",
  },
  description:
    "Compare quotes from 15,000+ local garages, mobile mechanics and dealerships. Book online, save money, and get your car fixed fast.",
  keywords: [
    "car repair",
    "mechanic",
    "garage",
    "MOT",
    "car service",
    "auto repair",
    "fix my car",
  ],
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "Quote My Garage",
    title: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    description:
      "Compare quotes from 15,000+ local garages, mobile mechanics and dealerships.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quote My Garage – Find Trusted Local Garages & Mechanics",
    description:
      "Compare quotes from 15,000+ local garages and mechanics. Book online and save.",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
