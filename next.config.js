// Hosts whose images next/image may optimise. The list is also given to the app (NEXT_PUBLIC_IMAGE_HOSTS, below) so
// <RemoteImage> can fall back to a plain <img> for any other host: next/image throws on a host that isn't listed, and a
// garage's photo URL isn't always one of these.
const IMAGE_HOSTS = [
  'quotemygarage-assets.s3.amazonaws.com',
  'quotemygarage-assets.s3.ap-southeast-1.amazonaws.com',
  'images.unsplash.com',
  'lh3.googleusercontent.com',
  // Vercel Blob: garage photos, avatars, documents' thumbnails and business-website images (each store has its own
  // <id>.public.blob.vercel-storage.com host).
  '*.public.blob.vercel-storage.com',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework on every response.
  poweredByHeader: false,
  env: { NEXT_PUBLIC_IMAGE_HOSTS: IMAGE_HOSTS.join(',') },
  images: {
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: 'https', hostname })),
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // Only the public booking widget (/widget/*) may be iframed by other sites; every
  // other page stays same-origin. Per-garage origin allow-lists aren't possible with
  // static headers, so the widget is embeddable anywhere by design.
  async headers() {
    return [
      // The service worker must always be re-fetched, or a bad version could stay installed for a day.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // Baseline hardening for every response. A full script/style CSP is deliberately not set yet: Next inlines
      // scripts and the app loads Stripe/Google, so it needs a nonce-based policy tested in report-only first.
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self), interest-cohort=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        source: '/((?!widget(?:/|$)).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        source: '/widget/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors *; object-src 'none'; base-uri 'self'" }],
      },
    ]
  },
}

module.exports = nextConfig
