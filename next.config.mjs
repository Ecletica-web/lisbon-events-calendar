import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [{ url: '/offline', revision: '1' }],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // googleapis is huge / Node-native; keep it out of the webpack bundle on Vercel
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
}

export default withSerwist(nextConfig)
