import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { authApi } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'

export function LoginPage() {
  const { user, loading, login, demoLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [demoPending, setDemoPending] = useState(false)
  const [credsOpen, setCredsOpen] = useState(false)
  const { data: config } = useQuery({
    queryKey: queryKeys.config,
    queryFn: authApi.config,
    staleTime: Infinity,
  })

  if (!loading && user) return <Navigate to="/projects" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/projects'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  const enterDemo = async () => {
    setError(null)
    setDemoPending(true)
    try {
      await demoLogin()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDemoPending(false)
    }
  }

  const showDemo = !!config?.demo

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/icon.png" alt="Trazer" className="size-16 rounded-2xl shadow-md" />
          <div className="flex items-center gap-2">
            <img src="/trzrtext.png" alt="Trazer" className="h-5" />
            {showDemo && (
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Demo
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Track less. Build more.</p>
        </div>

        {showDemo ? (
          <>
            <Button type="button" className="w-full" size="lg" disabled={demoPending} onClick={enterDemo}>
              {demoPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              Try the demo
            </Button>
            <button
              type="button"
              onClick={() => setCredsOpen((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Sign in with credentials
              <ChevronDown className={cn('size-3 transition-transform', credsOpen && 'rotate-180')} />
            </button>
            {credsOpen && (
              <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border bg-card p-5">
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={pending || loading}>
                  {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-card p-6 shadow-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending || loading}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Sign in
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              No self-service sign-up — ask an admin to create your account.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
