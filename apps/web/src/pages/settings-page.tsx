import { useQuery } from '@tanstack/react-query'
import { Database, Gauge, Info, Sparkles } from 'lucide-react'
import { authApi } from '../lib/api'
import { queryKeys } from '../lib/query-keys'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

export function SettingsPage() {
  const { user } = useAuth()
  const { data: config } = useQuery({ queryKey: queryKeys.config, queryFn: authApi.config, staleTime: Infinity })
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: authApi.users })

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Info className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Trazer settings</h2>
      </div>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Demo mode</h3>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          When enabled, a one-click demo login appears on the sign-in page and the seeded data is reset
          to a clean state on every API restart. Toggled at deploy time via the <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Demo__Enabled</code> env var.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('size-1.5 rounded-full', config?.demo ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          <span>{config?.demo ? 'Enabled' : 'Disabled'}</span>
          {config?.demoEmail && <span className="text-muted-foreground">— demo login: {config.demoEmail}</span>}
        </div>
      </section>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">System</h3>
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd className="text-foreground">{user?.name} ({user?.email})</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="text-foreground">{user?.isAdmin ? 'Admin' : 'Member'}</dd>
          <dt className="text-muted-foreground">Users</dt>
          <dd className="text-foreground">{users?.length ?? '—'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Data</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          All data lives in Postgres. Saved filters are per-user. The CLI (<code className="rounded bg-muted px-1 py-0.5 text-[10px]">trazer user create / project list / config</code>) can
          inspect and manage everything from the terminal.
        </p>
      </section>
    </div>
  )
}
