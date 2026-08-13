/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'quotemygarage-assets.s3.amazonaws.com',
      'quotemygarage-assets.s3.ap-southeast-1.amazonaws.com',
      'images.unsplash.com',
      'lh3.googleusercontent.com',
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
}

module.exports = nextConfig
