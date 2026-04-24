/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-lib: do not bundle (fixes webpack + @pdf-lib/standard-fonts re-export error)
  experimental: {
    serverComponentsExternalPackages: ['pdf-lib', '@pdf-lib/standard-fonts'],
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
