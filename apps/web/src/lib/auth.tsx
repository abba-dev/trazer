import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, setToken, type User } from './api'

type AuthContextValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('token')
    if (oauthToken) {
      setToken(oauthToken)
      params.delete('token')
      const next = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (next ? `?${next}` : ''))
    }
    if (!localStorage.getItem('trazer-token')) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const { token, user } = await authApi.login(email, password)
        setToken(token)
        setUser(user)
      },
      logout: () => {
        setToken(null)
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
