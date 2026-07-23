'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'day' | 'night'

const STORAGE_KEY = 'pager-theme'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', mode)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('night')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      const initial = stored === 'day' || stored === 'night' ? stored : 'night'
      setThemeState(initial)
      applyTheme(initial)
    } catch {
      applyTheme('night')
    }
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    applyTheme(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'night' ? 'day' : 'night')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: 'night' as ThemeMode,
      setTheme: (_: ThemeMode) => {},
      toggleTheme: () => {},
    }
  }
  return ctx
}
