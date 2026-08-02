import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Loader2, Zap } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'

export function LoginPage() {
  const { user, loading, login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!loading && user) return <Navigate to="/projects" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, name, password)
      navigate('/projects', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="size-6" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Trazer</h1>
          <p className="text-sm text-muted-foreground">Track less. Build more.</p>
        </div>

        <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-card p-6 shadow-sm">
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
          {mode === 'register' && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || loading}>
            {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className={cn('text-xs text-muted-foreground hover:text-foreground')}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </form>

        {mode === 'login' && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Demo: demo@trazer.dev / password123
          </p>
        )}
      </div>
    </div>
  )
}
