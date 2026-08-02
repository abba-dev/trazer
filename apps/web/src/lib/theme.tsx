import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

type ThemeContextValue = { theme: Theme; setTheme: (t: Theme) => void }

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('trazer-theme') as Theme | null
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('trazer-theme', t)
  }

  useEffect(() => {
    const apply = () => {
      const root = document.documentElement
      root.classList.toggle('dark', resolve(theme) === 'dark')
      root.style.colorScheme = resolve(theme)
    }
    apply()
    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
