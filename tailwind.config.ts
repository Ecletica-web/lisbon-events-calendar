import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminus: {
          bg: 'var(--terminus-bg)',
          elevated: 'var(--terminus-bg-elevated)',
          muted: 'var(--terminus-bg-muted)',
          fg: 'var(--terminus-fg)',
          'fg-muted': 'var(--terminus-fg-muted)',
          'fg-faint': 'var(--terminus-fg-faint)',
          border: 'var(--terminus-border)',
          strong: 'var(--terminus-border-strong)',
          accent: 'var(--terminus-accent)',
          'accent-fg': 'var(--terminus-accent-fg)',
        },
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'Courier New', 'Courier', 'monospace'],
        pixel: ['"Press Start 2P"', 'IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        none: '0',
      },
      keyframes: {
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pixelIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeSlideIn: 'fadeSlideIn 0.5s ease-out forwards',
        pixelIn: 'pixelIn 0.35s steps(4) forwards',
      },
    },
  },
  plugins: [],
}
export default config
