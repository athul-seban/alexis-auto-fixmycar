import Link from "next/link"
import { Wrench, Phone, Mail, MapPin, Facebook, Twitter, Instagram, Linkedin } from "lucide-react"

const footerLinks = {
  services: [
    { label: "MOT Test", href: "/services/mot" },
    { label: "Full Service", href: "/services/full-service" },
    { label: "Brakes", href: "/services/brakes" },
    { label: "Tyres", href: "/services/tyres" },
    { label: "Diagnostics", href: "/services/diagnostics" },
    { label: "Engine Repair", href: "/services/engine-repair" },
    { label: "Clutch", href: "/services/clutch" },
    { label: "Cambelt", href: "/services/cambelt" },
  ],
  company: [
    { label: "About Us", href: "/about" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Blog", href: "/blog" },
    { label: "Press", href: "/press" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  forGarages: [
    { label: "List Your Garage", href: "/garage-register" },
    { label: "Garage Login", href: "/login?type=garage" },
    { label: "Become Verified", href: "/for-garages/verified" },
    { label: "Pricing", href: "/for-garages/pricing" },
    { label: "Resources", href: "/for-garages/resources" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Sitemap", href: "/sitemap" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-[#0F1F3D] text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#F97316]">
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold">
                Fix<span className="text-[#F97316]">MyCar</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-6">
              Compare quotes from 15,000+ local garages, mobile mechanics and dealerships.
              Book online and save on every job.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Phone className="h-4 w-4 text-[#F97316]" />
                <span>0800 123 4567</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Mail className="h-4 w-4 text-[#F97316]" />
                <span>support@fixmycar.com</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <MapPin className="h-4 w-4 text-[#F97316]" />
                <span>London, United Kingdom</span>
              </div>
            </div>
            {/* Social */}
            <div className="flex items-center gap-3 mt-6">
              {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-[#F97316] transition-colors cursor-pointer"
                  aria-label="Social link"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
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
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} FixMyCar Ltd. All rights reserved. Registered in England & Wales.
            </p>
            <div className="flex items-center gap-6">
              {footerLinks.legal.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-slate-500 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
