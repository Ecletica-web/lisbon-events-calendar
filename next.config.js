/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // googleapis is huge / Node-native; keep it out of the webpack bundle on Vercel
  serverExternalPackages: ['googleapis', 'google-auth-library'],
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
}

module.exports = nextConfig
