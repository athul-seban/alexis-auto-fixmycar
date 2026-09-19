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
}

module.exports = nextConfig
