import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, Loader2, Rocket, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { authApi, projectApi, setToken, type User } from '../lib/api'
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

  // Fresh install, no accounts yet: run the first-run wizard instead of the login form.
  if (config?.setupRequired) return <SetupWizard />

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

// First install: bootstrap the admin, then create the first project. Two steps, no extra screens.
function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'admin' | 'project'>('admin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [user, setUserState] = useState<User | null>(null)

  const createAdmin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await authApi.bootstrapAdmin({ email, name: name || email.split('@')[0]!, password })
      setToken(res.token)
      setUserState(res.user)
      setStep('project')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setPending(false)
    }
  }

  const createProject = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      // The bootstrap response already stored the JWT; the project create call carries it.
      const cleanKey = projectKey.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(cleanKey)) throw new Error('Key must be 2-10 letters/digits, start with a letter')
      await projectApi.create({ key: cleanKey, name: projectName.trim() })
      navigate(`/projects/${cleanKey}/board`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/icon.png" alt="Trazer" className="size-16 rounded-2xl shadow-md" />
          <div className="flex items-center gap-2">
            <img src="/trzrtext.png" alt="Trazer" className="h-5" />
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              First run
            </span>
          </div>
          <Rocket className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Set up Trazer</h1>
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {step === 'admin'
              ? 'Create the first admin account. You can add teammates later.'
              : `Welcome, ${user?.name ?? ''}. Give your first project a key — it shows up on every issue card.`}
          </p>
        </div>

        {step === 'admin' ? (
          <form onSubmit={createAdmin} className="grid gap-3 rounded-lg border bg-card p-6 shadow-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="setup-name">Name</Label>
              <Input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="setup-email">Email</Label>
              <Input id="setup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="setup-password">Password</Label>
              <Input id="setup-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" autoComplete="new-password" />
            </div>
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
              Create admin
            </Button>
          </form>
        ) : (
          <form onSubmit={createProject} className="grid gap-3 rounded-lg border bg-card p-6 shadow-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="setup-pkey">Project key</Label>
              <Input id="setup-pkey" required minLength={2} maxLength={10} value={projectKey} onChange={(e) => setProjectKey(e.target.value)}
                placeholder="GAME" autoCapitalize="characters" className="font-mono uppercase" />
              <p className="text-[11px] text-muted-foreground">2-10 letters/digits, first letter α. Used in keys like <code>GAME-1</code>.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="setup-pname">Project name</Label>
              <Input id="setup-pname" required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Launch the game" />
            </div>
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />}
              Create project
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}