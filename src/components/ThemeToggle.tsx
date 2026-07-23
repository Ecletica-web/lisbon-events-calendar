'use client'

import { useTheme } from '@/lib/theme/ThemeProvider'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isNight = theme === 'night'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`pager-btn pager-btn-ghost text-[10px] uppercase tracking-wider px-2 py-1.5 min-h-[36px] ${className}`}
      aria-label={isNight ? 'Switch to day mode' : 'Switch to night mode'}
      title={isNight ? 'Day mode' : 'Night mode'}
    >
      {isNight ? 'DAY' : 'NIGHT'}
    </button>
  )
}
