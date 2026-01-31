import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lisbon Events Calendar',
  description: 'Cultural events calendar for Lisbon',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
