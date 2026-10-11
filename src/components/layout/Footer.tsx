import { DevelopedBy } from "@/components/layout/DevelopedBy"
import Link from "next/link"
import { Wrench } from "lucide-react"

// Only links to pages that exist. Legal pages, contact details and social profiles are added once the business
// supplies them; until then they are left out rather than linking to 404s or placeholders.
const footerLinks = {
  services: [
    { label: "MOT Test", href: "/search?service=MOT" },
    { label: "Full Service", href: "/search?service=FULL_SERVICE" },
    { label: "Brakes", href: "/search?service=BRAKES" },
    { label: "Tyres", href: "/search?service=TYRES" },
    { label: "Diagnostics", href: "/search?service=DIAGNOSTICS" },
    { label: "Repairs", href: "/search?service=REPAIR" },
    { label: "Clutch", href: "/search?service=CLUTCH" },
    { label: "Cambelt", href: "/search?service=CAMBELT" },
  ],
  company: [
    { label: "How It Works", href: "/how-it-works" },
    { label: "Guides & Blog", href: "/blog" },
    { label: "Find Garages by Location", href: "/garages" },
    { label: "Post a Job", href: "/post-job" },
  ],
  forGarages: [
    { label: "List Your Garage", href: "/garage-register" },
    { label: "Garage Login", href: "/login?type=garage" },
    { label: "Why Join", href: "/for-garages" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-[#0F1F3D] text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-10 lg:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#F97316]">
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold">
                Quote<span className="text-[#F97316]">MyGarage</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-6">
              Compare quotes from local garages and mobile mechanics, read real reviews and book online.
            </p>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-white mb-4">Services</h3>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* For Garages */}
          <div>
            <h3 className="font-semibold text-white mb-4">For Garages</h3>
            <ul className="space-y-2">
              {footerLinks.forGarages.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
              <p className="text-xs text-slate-400">
                © {new Date().getFullYear()} Quote My Garage Ltd. All rights reserved. Registered in England & Wales.
              </p>
              <DevelopedBy className="text-xs text-slate-400" linkClassName="text-slate-200 hover:text-white" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
