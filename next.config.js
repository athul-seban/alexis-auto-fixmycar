/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'quotemygarage-assets.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'quotemygarage-assets.s3.ap-southeast-1.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // Only the public booking widget (/widget/*) may be iframed by other sites; every
  // other page stays same-origin. Per-garage origin allow-lists aren't possible with
  // static headers, so the widget is embeddable anywhere by design.
  async headers() {
    return [
      {
        source: '/((?!widget(?:/|$)).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/widget/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ]
  },
}

module.exports = nextConfig
