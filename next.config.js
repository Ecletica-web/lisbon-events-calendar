/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // googleapis is huge / Node-native; keep it out of the webpack bundle on Vercel
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
}

module.exports = nextConfig
